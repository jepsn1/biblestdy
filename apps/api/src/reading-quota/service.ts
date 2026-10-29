import {
  addDays,
  copenhagenDay,
  decide,
  READING_QUOTA_POLICY,
  type DenyReason,
  type ReadingQuotaPolicy,
  type SubjectLimits,
} from './policy';
import type { ChapterRef, QuotaStore } from './store';

export type { ChapterRef };

/** `::ffff:1.2.3.4` (IPv4 on a dual-stack socket) → `1.2.3.4`: one subject. */
const ipKey = (ip: string) =>
  ip.replace(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i, '$1');

/** Day reads are kept this many days back from today, then pruned. */
const KEEP_DAYS = 2;

/** One chapter request: who is reading what. */
export interface QuotaCheck {
  userId: string;
  /** Client IP (req.ip). Checked as subject `ip:<addr>`; absent → account only. */
  ip?: string;
  chapter: ChapterRef;
}

export type QuotaOutcome =
  | { allowed: true }
  | {
      allowed: false;
      reason: DenyReason;
      retryAfterMs: number;
      /** The subject that denied (longest retry-after when several do). */
      subject: string;
    };

export interface ReadingQuotaDeps {
  store: QuotaStore;
  policy?: ReadingQuotaPolicy;
  /** Epoch-ms clock; injectable for tests. */
  now?: () => number;
  logger?: { warn(message: string): void };
}

interface Subject {
  key: string;
  limits: SubjectLimits;
}

/**
 * Reading-quota service (PRD #25 module 3): runs the policy for every subject
 * of a request inside one store transaction. All subjects must allow for the
 * request to pass; only then is state committed for all of them. On denial the
 * longest retry-after wins and the denial is logged.
 */
export class ReadingQuotaService {
  private readonly store: QuotaStore;
  private readonly policy: ReadingQuotaPolicy;
  private readonly now: () => number;
  private readonly logger?: { warn(message: string): void };

  constructor(deps: ReadingQuotaDeps) {
    this.store = deps.store;
    this.policy = deps.policy ?? READING_QUOTA_POLICY;
    this.now = deps.now ?? Date.now;
    this.logger = deps.logger;
  }

  /** Subjects checked per request: the account, plus the IP when known. */
  private subjects(check: QuotaCheck): Subject[] {
    const subjects = [
      { key: `user:${check.userId}`, limits: this.policy.account },
    ];
    if (check.ip)
      subjects.push({ key: `ip:${ipKey(check.ip)}`, limits: this.policy.ip });
    return subjects;
  }

  async check(check: QuotaCheck): Promise<QuotaOutcome> {
    const subjects = this.subjects(check);
    const outcome = await this.store.transact(
      subjects.map((s) => s.key),
      async (tx): Promise<QuotaOutcome> => {
        const now = this.now();
        const day = copenhagenDay(now);
        const decisions = await Promise.all(
          subjects.map(async (s) => {
            const today = await tx.dayReads(s.key, day, check.chapter);
            return {
              subject: s.key,
              firstReadToday: !today.includes,
              decision: decide({
                state: await tx.load(s.key),
                now,
                limits: s.limits,
                cooldown: this.policy.cooldown,
                readToday: today.count,
                alreadyReadToday: today.includes,
              }),
            };
          }),
        );
        let denied: Extract<QuotaOutcome, { allowed: false }> | undefined;
        for (const { subject, decision } of decisions) {
          if (decision.allowed) continue;
          if (!denied || decision.retryAfterMs > denied.retryAfterMs)
            denied = {
              allowed: false,
              reason: decision.reason,
              retryAfterMs: decision.retryAfterMs,
              subject,
            };
        }
        // Allowed → every subject spends. Denied → nothing is spent; each
        // denying subject's next state (refill progress, strike, cooldown) is
        // persisted. Subjects that allowed are left untouched: no strike.
        for (const { subject, decision, firstReadToday } of decisions) {
          if (!denied || !decision.allowed)
            await tx.save(subject, decision.next);
          if (!denied && firstReadToday)
            await tx.recordRead(subject, day, check.chapter);
        }
        return denied ?? { allowed: true };
      },
    );
    if (!outcome.allowed)
      this.logger?.warn(
        `reading quota denied subject=${outcome.subject} reason=${outcome.reason} retryAfterMs=${outcome.retryAfterMs}`,
      );
    return outcome;
  }

  /** Drop day reads older than KEEP_DAYS Copenhagen days (user story 24). */
  prune(): Promise<void> {
    return this.store.prune(addDays(copenhagenDay(this.now()), -KEEP_DAYS));
  }
}
