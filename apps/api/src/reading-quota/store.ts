import type { QuotaState } from './policy';

/**
 * Quota store (PRD #25 module 2): per-subject state, loaded and saved
 * atomically. Subjects are keyed `user:<id>` / `ip:<address>`.
 */
export interface QuotaTx {
  /** Current state of a locked subject; `null` = never seen. */
  load(subject: string): Promise<QuotaState | null>;
  save(subject: string, state: QuotaState): Promise<void>;
}

export interface QuotaStore {
  /**
   * Run `fn` atomically with an exclusive lock on every subject in `subjects`
   * held until it settles: concurrent calls on a shared subject serialize, so
   * a token can't be spent twice. `fn` may only touch locked subjects.
   */
  transact<T>(subjects: string[], fn: (tx: QuotaTx) => Promise<T>): Promise<T>;
}

/** Test/dev double: one process, a promise-chain mutex per subject. */
export class InMemoryQuotaStore implements QuotaStore {
  private readonly states = new Map<string, QuotaState>();
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
      const result = await fn({
        load: (s) =>
          Promise.resolve(
            structuredClone(staged.get(s) ?? this.states.get(s) ?? null),
          ),
        save: (s, state) => {
          staged.set(s, structuredClone(state));
          return Promise.resolve();
        },
      });
      for (const [s, state] of staged) this.states.set(s, state);
      return result;
    } finally {
      release();
      for (const k of keys) if (this.locks.get(k) === held) this.locks.delete(k);
    }
  }
}
