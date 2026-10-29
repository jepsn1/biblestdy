/**
 * Reading-quota policy (PRD #25 module 1): the pure throttling decision for one
 * subject. No I/O, no clock — callers pass `now`. Storage lives in the quota
 * store, orchestration (account + IP subjects, logging) in the service.
 *
 * Slices: pace (#29), daily distinct-chapter cap (#30), IP subject (#31),
 * escalating cooldowns (#32). Each extends the policy object, the state and
 * the decide input additively.
 */

/** Token bucket: `burst` requests at once, then one more per `refillMs`. */
export interface PaceLimits {
  burst: number;
  refillMs: number;
}

/** All limits for one kind of subject (account or IP). */
export interface SubjectLimits {
  pace: PaceLimits;
  /** Distinct chapters (translation+book+chapter) per Copenhagen day. */
  dailyChapters: number;
}

/** Every throttling number in one place — tune here (user story 21). */
export interface ReadingQuotaPolicy {
  /** Per signed-in account, subject `user:<id>`. */
  account: SubjectLimits;
  /**
   * Per client IP, subject `ip:<addr>`. Looser than the account so a shared
   * network (church, school, office) doesn't block its readers (story 9).
   */
  ip: SubjectLimits;
}

export const READING_QUOTA_POLICY: ReadingQuotaPolicy = {
  account: { pace: { burst: 20, refillMs: 3000 }, dailyChapters: 150 },
  ip: { pace: { burst: 40, refillMs: 1500 }, dailyChapters: 400 },
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
  /** Distinct chapters this subject read today (Copenhagen day of `now`). */
  readToday: number;
  /** The requested chapter is among them: free against the daily cap. */
  alreadyReadToday: boolean;
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

const COPENHAGEN = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Copenhagen',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/** Copenhagen wall-clock fields at `now`. */
function copenhagenParts(now: number) {
  return Object.fromEntries(
    COPENHAGEN.formatToParts(now).map((x) => [x.type, Number(x.value)]),
  ) as Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', number>;
}

/** The daily cap's "day": calendar date in Europe/Copenhagen, `YYYY-MM-DD`. */
export function copenhagenDay(now: number): string {
  const { year, month, day } = copenhagenParts(now);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** `YYYY-MM-DD` shifted by whole calendar days. */
export function addDays(day: string, days: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Ms from `now` to the next Copenhagen midnight (DST-aware: 23–25 h days). */
export function msUntilCopenhagenMidnight(now: number): number {
  const { year, month, day } = copenhagenParts(now);
  // Copenhagen is UTC+1 or +2; DST switches at 01:00 UTC, never at midnight,
  // so local midnight exists once and its offset is the one in force then.
  const asUtc = Date.UTC(year, month - 1, day + 1);
  for (const offsetH of [1, 2]) {
    const candidate = asUtc - offsetH * 3_600_000;
    const p = copenhagenParts(candidate);
    if (p.hour === 0 && p.minute === 0 && p.second === 0)
      return candidate - now;
  }
  throw new Error(`no Copenhagen midnight after ${now}`);
}

/** Decide one chapter request for one subject. Denials consume nothing. */
export function decide({
  state,
  now,
  limits,
  readToday,
  alreadyReadToday,
}: DecideInput): QuotaDecision {
  const { pace } = limits;
  const current = refill(state, now, pace);
  // Daily cap first: its wait (until midnight) outlasts any pace wait
  if (!alreadyReadToday && readToday >= limits.dailyChapters)
    return {
      allowed: false,
      reason: 'daily',
      retryAfterMs: msUntilCopenhagenMidnight(now),
      next: current,
    };
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
