/**
 * Reading-quota policy (PRD #25 module 1): the pure throttling decision for one
 * subject. No I/O, no clock — callers pass `now`. Storage lives in the quota
 * store, orchestration (account + IP subjects, logging) in the service.
 *
 * Slices: pace (#29, this), daily distinct-chapter cap (#30), IP subject
 * (#31), escalating cooldowns (#32). Each extends the policy object, the state
 * and the decide input additively.
 */

/** Token bucket: `burst` requests at once, then one more per `refillMs`. */
export interface PaceLimits {
  burst: number;
  refillMs: number;
}

/** All limits for one kind of subject (account, later IP). */
export interface SubjectLimits {
  pace: PaceLimits;
}

/** Every throttling number in one place — tune here (user story 21). */
export interface ReadingQuotaPolicy {
  account: SubjectLimits;
}

export const READING_QUOTA_POLICY: ReadingQuotaPolicy = {
  account: { pace: { burst: 20, refillMs: 3000 } },
};

/** Persisted per-subject state. `null` = never seen (fresh, full bucket). */
export interface QuotaState {
  /** Whole tokens left in the bucket. */
  tokens: number;
  /** Epoch ms the bucket was last topped up to `tokens`; refill counts from here. */
  refilledAt: number;
}

export type DenyReason = 'pace' | 'daily' | 'cooldown';

export interface DecideInput {
  state: QuotaState | null;
  /** Epoch ms. */
  now: number;
  limits: SubjectLimits;
}

export type QuotaDecision =
  | { allowed: true; reason: null; retryAfterMs: 0; next: QuotaState }
  | {
      allowed: false;
      reason: DenyReason;
      retryAfterMs: number;
      /** State to persist even on denial (refill progress; later strikes). */
      next: QuotaState;
    };

/** Top the bucket up with every whole refill period elapsed since refilledAt. */
function refill(
  state: QuotaState | null,
  now: number,
  pace: PaceLimits,
): QuotaState {
  if (!state) return { tokens: pace.burst, refilledAt: now };
  const elapsed = Math.max(0, now - state.refilledAt);
  const periods = Math.floor(elapsed / pace.refillMs);
  const tokens = state.tokens + periods;
  if (tokens >= pace.burst) return { tokens: pace.burst, refilledAt: now };
  return { tokens, refilledAt: state.refilledAt + periods * pace.refillMs };
}

/** Decide one chapter request for one subject. Denials consume nothing. */
export function decide({ state, now, limits }: DecideInput): QuotaDecision {
  const { pace } = limits;
  const current = refill(state, now, pace);
  if (current.tokens >= 1) {
    return {
      allowed: true,
      reason: null,
      retryAfterMs: 0,
      next: { tokens: current.tokens - 1, refilledAt: current.refilledAt },
    };
  }
  return {
    allowed: false,
    reason: 'pace',
    retryAfterMs: current.refilledAt + pace.refillMs - now,
    next: current,
  };
}
