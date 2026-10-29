import {
  decide,
  READING_QUOTA_POLICY,
  type DenyReason,
  type ReadingQuotaPolicy,
  type SubjectLimits,
} from './policy';
import type { QuotaStore } from './store';

/** The chapter being requested (the daily cap, #30, counts distinct ones). */
export interface ChapterRef {
  translationId: string;
  book: string;
  chapter: number;
}

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
      subjects.push({ key: `ip:${check.ip}`, limits: this.policy.ip });
    return subjects;
  }

  async check(check: QuotaCheck): Promise<QuotaOutcome> {
    const subjects = this.subjects(check);
    const outcome = await this.store.transact(
      subjects.map((s) => s.key),
      async (tx): Promise<QuotaOutcome> => {
        const now = this.now();
        const decisions = await Promise.all(
          subjects.map(async (s) => ({
            subject: s.key,
            decision: decide({
              state: await tx.load(s.key),
              now,
              limits: s.limits,
            }),
          })),
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
        // Allowed → every subject spends. Denied → nothing is spent; the
        // denial's next state (refill progress, later strikes) is persisted.
        for (const { subject, decision } of decisions)
          if (!denied || !decision.allowed)
            await tx.save(subject, decision.next);
        return denied ?? { allowed: true };
      },
    );
    if (!outcome.allowed)
      this.logger?.warn(
        `reading quota denied subject=${outcome.subject} reason=${outcome.reason} retryAfterMs=${outcome.retryAfterMs}`,
      );
    return outcome;
  }
}
