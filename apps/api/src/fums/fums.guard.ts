import { ipKey } from '../reading-quota/service';

/**
 * Keeps the FUMS relay honest (it reports to API.Bible in our name, so it
 * must not be usable to inflate their usage counts):
 * 1. only tokens this server issued with a chapter it served to THIS sign-in
 *    session recently are relayed (`IssuedTokens`);
 * 2. view reports are paced per session and per IP — token buckets in the
 *    reading quota's style (policy.ts: pure decision, caller passes `now`),
 *    kept in memory: losing them on restart only resets a few minutes' pace.
 */

/** Token bucket: `burst` reports at once, then one more per `refillMs`. */
export interface FumsPace {
  burst: number;
  refillMs: number;
}

export interface FumsViewPolicy {
  session: FumsPace;
  ip: FumsPace;
  /** How long a served chapter's token stays reportable (the reader keeps
   * text in memory for 30 min after last use; notes for 1 h). */
  issuedTtlMs: number;
  /** Most remembered tokens per session (oldest go first). */
  maxPerSession: number;
}

/** One report per page shown: a reader turning chapters fast stays well
 * inside (chapters are paced by the reading quota: one per 2 s). */
export const FUMS_VIEW_POLICY: FumsViewPolicy = {
  session: { burst: 20, refillMs: 2000 },
  ip: { burst: 60, refillMs: 1000 },
  issuedTtlMs: 6 * 3_600_000,
  maxPerSession: 300,
};

export interface Bucket {
  tokens: number;
  refilledAt: number;
}

/** Pure: take one from the bucket at `now`, or say how long to wait. */
export function takeOne(
  bucket: Bucket | undefined,
  now: number,
  pace: FumsPace,
): { allowed: true; next: Bucket } | { allowed: false; retryAfterMs: number } {
  let b = bucket ?? { tokens: pace.burst, refilledAt: now };
  const periods = Math.floor(Math.max(0, now - b.refilledAt) / pace.refillMs);
  b =
    b.tokens + periods >= pace.burst
      ? { tokens: pace.burst, refilledAt: now }
      : {
          tokens: b.tokens + periods,
          refilledAt: b.refilledAt + periods * pace.refillMs,
        };
  if (b.tokens < 1) {
    return { allowed: false, retryAfterMs: b.refilledAt + pace.refillMs - now };
  }
  return { allowed: true, next: { ...b, tokens: b.tokens - 1 } };
}

/** Per-session + per-IP pacing of view reports (both must allow). */
export class FumsPacer {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly policy: FumsViewPolicy = FUMS_VIEW_POLICY,
    private readonly now: () => number = Date.now,
  ) {}

  /** Allowed (and spent), or the longest wait. */
  take(
    sessionKey: string,
    ip: string | undefined,
  ): { allowed: true } | { allowed: false; retryAfterMs: number } {
    const now = this.now();
    const subjects: [string, FumsPace][] = [
      [`session:${sessionKey}`, this.policy.session],
    ];
    if (ip) subjects.push([`ip:${ipKey(ip)}`, this.policy.ip]);
    const decisions = subjects.map(([key, pace]) => ({
      key,
      d: takeOne(this.buckets.get(key), now, pace),
    }));
    const denied = decisions.filter((x) => !x.d.allowed);
    if (denied.length > 0) {
      return {
        allowed: false,
        retryAfterMs: Math.max(
          ...denied.map((x) => (x.d.allowed ? 0 : x.d.retryAfterMs)),
        ),
      };
    }
    // Only a request every subject allows spends anything
    for (const { key, d } of decisions)
      if (d.allowed) this.buckets.set(key, d.next);
    this.prune(now);
    return { allowed: true };
  }

  /** Full buckets carry no state: forget them (bounded memory). */
  private prune(now: number) {
    if (this.buckets.size < 10_000) return;
    for (const [key, b] of this.buckets) {
      const pace = key.startsWith('ip:') ? this.policy.ip : this.policy.session;
      if (now - b.refilledAt >= pace.burst * pace.refillMs)
        this.buckets.delete(key);
    }
  }
}

/** The FUMS tokens served to each session lately. */
export class IssuedTokens {
  private readonly bySession = new Map<string, Map<string, number>>();

  constructor(
    private readonly policy: FumsViewPolicy = FUMS_VIEW_POLICY,
    private readonly now: () => number = Date.now,
  ) {}

  /** A chapter carrying `token` was just served to this session. */
  record(sessionKey: string, token: string): void {
    const now = this.now();
    const tokens = this.bySession.get(sessionKey) ?? new Map<string, number>();
    tokens.delete(token); // re-insert: newest last
    tokens.set(token, now);
    while (tokens.size > this.policy.maxPerSession) {
      const [oldest] = tokens.keys();
      tokens.delete(oldest);
    }
    this.bySession.set(sessionKey, tokens);
    if (this.bySession.size > 5_000) this.prune(now);
  }

  /** The reported tokens this session was served within the TTL. */
  accept(sessionKey: string, reported: string[]): string[] {
    const now = this.now();
    const tokens = this.bySession.get(sessionKey);
    if (!tokens) return [];
    return reported.filter((t) => {
      const at = tokens.get(t);
      return at !== undefined && now - at < this.policy.issuedTtlMs;
    });
  }

  private prune(now: number) {
    for (const [session, tokens] of this.bySession) {
      for (const [t, at] of tokens) {
        if (now - at >= this.policy.issuedTtlMs) tokens.delete(t);
      }
      if (tokens.size === 0) this.bySession.delete(session);
    }
  }
}

/** Whose tokens these are: the sign-in session (one per device), else the
 * account (tests' stand-in guards carry no session). */
export const fumsSessionKey = (user: { id: string; sessionId?: string }) =>
  user.sessionId ?? `user:${user.id}`;
