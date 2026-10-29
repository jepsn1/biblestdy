import type { QuotaState } from './policy';

/** A chapter; the daily cap counts distinct ones. */
export interface ChapterRef {
  translationId: string;
  book: string;
  chapter: number;
}

/** What a subject read on one day, as far as the daily cap cares. */
export interface DayReads {
  /** Distinct chapters read that day. */
  count: number;
  /** The asked-about chapter is among them. */
  includes: boolean;
}

/**
 * Quota store (PRD #25 module 2): per-subject state, loaded and saved
 * atomically, plus which distinct chapters a subject read on which day
 * (`day` = Copenhagen `YYYY-MM-DD`). Subjects are keyed `user:<id>` /
 * `ip:<address>`.
 */
export interface QuotaTx {
  /** Current state of a locked subject; `null` = never seen. */
  load(subject: string): Promise<QuotaState | null>;
  save(subject: string, state: QuotaState): Promise<void>;
  /** A locked subject's reads on `day`, and whether `chapter` is one. */
  dayReads(
    subject: string,
    day: string,
    chapter: ChapterRef,
  ): Promise<DayReads>;
  /** Record that a locked subject read `chapter` on `day` (idempotent). */
  recordRead(subject: string, day: string, chapter: ChapterRef): Promise<void>;
}

export interface QuotaStore {
  /**
   * Run `fn` atomically with an exclusive lock on every subject in `subjects`
   * held until it settles: concurrent calls on a shared subject serialize, so
   * a token can't be spent twice. `fn` may only touch locked subjects.
   */
  transact<T>(subjects: string[], fn: (tx: QuotaTx) => Promise<T>): Promise<T>;
  /**
   * Housekeeping (user story 24): drop day reads before `keepFromDay`, and
   * subject rows that never got state (lock placeholders) idle since then.
   */
  prune(keepFromDay: string): Promise<void>;
}

const chapterKey = (c: ChapterRef) =>
  `${c.translationId}|${c.book}|${c.chapter}`;

/** Test/dev double: one process, a promise-chain mutex per subject. */
export class InMemoryQuotaStore implements QuotaStore {
  private readonly states = new Map<string, QuotaState>();
  /** `subject|day` → chapter keys read. */
  private readonly reads = new Map<string, Set<string>>();
  private readonly locks = new Map<string, Promise<void>>();

  async transact<T>(
    subjects: string[],
    fn: (tx: QuotaTx) => Promise<T>,
  ): Promise<T> {
    const keys = [...new Set(subjects)].sort();
    const prior = keys.map((k) => this.locks.get(k) ?? Promise.resolve());
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    for (const k of keys) this.locks.set(k, held);
    await Promise.all(prior);
    try {
      const staged = new Map<string, QuotaState>();
      const stagedReads: [string, string][] = [];
      const readsOf = (subject: string, day: string) => {
        const key = `${subject}|${day}`;
        const set = new Set(this.reads.get(key));
        for (const [k, c] of stagedReads) if (k === key) set.add(c);
        return set;
      };
      const result = await fn({
        load: (s) =>
          Promise.resolve(
            structuredClone(staged.get(s) ?? this.states.get(s) ?? null),
          ),
        save: (s, state) => {
          staged.set(s, structuredClone(state));
          return Promise.resolve();
        },
        dayReads: (s, day, chapter) => {
          const set = readsOf(s, day);
          return Promise.resolve({
            count: set.size,
            includes: set.has(chapterKey(chapter)),
          });
        },
        recordRead: (s, day, chapter) => {
          stagedReads.push([`${s}|${day}`, chapterKey(chapter)]);
          return Promise.resolve();
        },
      });
      for (const [s, state] of staged) this.states.set(s, state);
      for (const [key, c] of stagedReads) {
        const set = this.reads.get(key) ?? new Set<string>();
        set.add(c);
        this.reads.set(key, set);
      }
      return result;
    } finally {
      release();
      for (const k of keys)
        if (this.locks.get(k) === held) this.locks.delete(k);
    }
  }

  prune(keepFromDay: string): Promise<void> {
    for (const key of this.reads.keys())
      if (key.slice(key.lastIndexOf('|') + 1) < keepFromDay)
        this.reads.delete(key);
    return Promise.resolve();
  }
}
