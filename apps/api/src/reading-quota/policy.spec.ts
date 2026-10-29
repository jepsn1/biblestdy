import { describe, expect, it } from 'vitest';
import {
  copenhagenDay,
  decide,
  msUntilCopenhagenMidnight,
  READING_QUOTA_POLICY,
  type QuotaDecision,
  type QuotaState,
  type SubjectLimits,
} from './policy';

/** Reading-quota policy (#29, #30): pace + daily cap, injected clock. */
const limits: SubjectLimits = READING_QUOTA_POLICY.account;
const T0 = Date.UTC(2026, 9, 29, 10, 0, 0);
/** Nothing read today yet: pace tests never touch the daily cap. */
const fresh = { readToday: 0, alreadyReadToday: false };

/** Fire `n` requests at `now`, threading state; returns the decisions. */
function burst(state: QuotaState | null, n: number, now: number) {
  const out: QuotaDecision[] = [];
  for (let i = 0; i < n; i++) {
    const d = decide({ state, now, limits, ...fresh });
    if (d.allowed) state = d.next;
    out.push(d);
  }
  return { decisions: out, state };
}

describe('reading-quota policy: pace (token bucket)', () => {
  it('account policy = burst 20, refill 1 per 3 s', () => {
    expect(READING_QUOTA_POLICY.account.pace).toEqual({
      burst: 20,
      refillMs: 3000,
    });
  });

  it('IP policy = burst 40, refill 1 per 1.5 s (looser, shared networks)', () => {
    expect(READING_QUOTA_POLICY.ip.pace).toEqual({
      burst: 40,
      refillMs: 1500,
    });
  });

  it('allows a fresh subject a full burst, then denies with reason pace', () => {
    const { decisions } = burst(null, 21, T0);
    expect(decisions.slice(0, 20).every((d) => d.allowed)).toBe(true);
    expect(decisions[20]).toMatchObject({ allowed: false, reason: 'pace' });
  });

  it('says exactly how long until the next token', () => {
    const { state } = burst(null, 20, T0);
    const d = decide({ state, now: T0 + 1000, limits, ...fresh });
    expect(d).toMatchObject({ allowed: false, retryAfterMs: 2000 });
  });

  it('refills one token per 3 s, never above the burst', () => {
    let { state } = burst(null, 20, T0);
    expect(burst(state, 2, T0 + 3000).decisions.map((d) => d.allowed)).toEqual([
      true,
      false,
    ]);
    ({ state } = burst(state, 2, T0 + 3 * 3000));
    expect(
      burst(state, 4, T0 + 3 * 3000).decisions.map((d) => d.allowed),
    ).toEqual([true, false, false, false]);
    // An hour idle tops up to the burst, not to 1200
    const idle = burst(state, 21, T0 + 3_600_000).decisions;
    expect(idle.filter((d) => d.allowed)).toHaveLength(20);
  });

  it('keeps partial refill progress across allowed requests', () => {
    let { state } = burst(null, 20, T0);
    // 4.5 s later: one token earned, 1.5 s banked toward the next
    ({ state } = burst(state, 1, T0 + 4500));
    const d = decide({ state, now: T0 + 4500, limits, ...fresh });
    expect(d).toMatchObject({ allowed: false, retryAfterMs: 1500 });
  });

  it('denied requests consume nothing (hammering does not delay the next token)', () => {
    const { state } = burst(null, 20, T0);
    let s = state;
    for (let t = T0; t < T0 + 3000; t += 100) {
      const d = decide({ state: s, now: t, limits, ...fresh });
      expect(d.allowed).toBe(false);
      s = d.next; // even persisting denial state must not cost tokens
    }
    expect(decide({ state: s, now: T0 + 3000, limits, ...fresh }).allowed).toBe(
      true,
    );
  });

  it('a steady human pace (1 chapter / 3 s) is never limited', () => {
    let state: QuotaState | null = null;
    for (let i = 0; i < 500; i++) {
      const d = decide({ state, now: T0 + i * 3000, limits, ...fresh });
      expect(d.allowed).toBe(true);
      state = d.next;
    }
  });
});

const HOUR = 3_600_000;
const MIN = 60_000;

describe('reading-quota policy: daily distinct-chapter cap', () => {
  it('account policy = 150 distinct chapters per day', () => {
    expect(READING_QUOTA_POLICY.account.dailyChapters).toBe(150);
  });

  it('IP policy = 400 distinct chapters per day (shared networks)', () => {
    expect(READING_QUOTA_POLICY.ip.dailyChapters).toBe(400);
  });

  it('allows the 150th distinct chapter, denies the 151st with reason daily', () => {
    // Winter, 11:00 Copenhagen (CET, UTC+1): 13 h to midnight
    const ok = decide({
      state: null,
      now: T0,
      limits,
      readToday: 149,
      alreadyReadToday: false,
    });
    expect(ok.allowed).toBe(true);
    const d = decide({
      state: null,
      now: T0,
      limits,
      readToday: 150,
      alreadyReadToday: false,
    });
    expect(d).toMatchObject({
      allowed: false,
      reason: 'daily',
      retryAfterMs: 13 * HOUR,
    });
  });

  it('re-opening a chapter already read today is free against the cap', () => {
    const d = decide({
      state: null,
      now: T0,
      limits,
      readToday: 150,
      alreadyReadToday: true,
    });
    expect(d.allowed).toBe(true);
  });

  it('repeats still cost pace tokens', () => {
    const { state } = burst(null, 20, T0);
    const d = decide({
      state,
      now: T0,
      limits,
      readToday: 150,
      alreadyReadToday: true,
    });
    expect(d).toMatchObject({ allowed: false, reason: 'pace' });
  });

  it('a daily denial consumes no pace tokens', () => {
    const d = decide({
      state: null,
      now: T0,
      limits,
      readToday: 150,
      alreadyReadToday: false,
    });
    expect(d.next.tokens).toBe(limits.pace.burst);
  });

  it('daily wins over pace when both deny (the longer wait)', () => {
    const { state } = burst(null, 20, T0);
    const d = decide({
      state,
      now: T0,
      limits,
      readToday: 150,
      alreadyReadToday: false,
    });
    expect(d).toMatchObject({ allowed: false, reason: 'daily' });
  });
});

describe('Copenhagen calendar day', () => {
  it('day key follows Copenhagen, not UTC', () => {
    // 23:30 UTC on 28 Oct = 00:30 on 29 Oct in Copenhagen (CET)
    expect(copenhagenDay(Date.UTC(2026, 9, 28, 23, 30))).toBe('2026-10-29');
    expect(copenhagenDay(Date.UTC(2026, 9, 28, 22, 59))).toBe('2026-10-28');
    // Summer (CEST, UTC+2): local midnight is 22:00 UTC
    expect(copenhagenDay(Date.UTC(2026, 6, 1, 21, 59))).toBe('2026-07-01');
    expect(copenhagenDay(Date.UTC(2026, 6, 1, 22, 0))).toBe('2026-07-02');
  });

  it('retry-after runs to the next Copenhagen midnight (winter + summer)', () => {
    expect(msUntilCopenhagenMidnight(Date.UTC(2026, 0, 15, 22, 30))).toBe(
      30 * MIN,
    );
    expect(msUntilCopenhagenMidnight(Date.UTC(2026, 6, 1, 21, 30))).toBe(
      30 * MIN,
    );
    // Exactly at midnight: a whole new day ahead
    expect(msUntilCopenhagenMidnight(Date.UTC(2026, 0, 15, 23, 0))).toBe(
      24 * HOUR,
    );
  });

  it('spring-forward day (29 Mar 2026) is 23 h long', () => {
    const midnight = Date.UTC(2026, 2, 28, 23, 0); // 00:00 CET, 29 Mar
    expect(copenhagenDay(midnight)).toBe('2026-03-29');
    expect(msUntilCopenhagenMidnight(midnight)).toBe(23 * HOUR);
    // After the jump (03:30 CEST = 01:30 UTC): next midnight 22:00 UTC
    expect(msUntilCopenhagenMidnight(Date.UTC(2026, 2, 29, 1, 30))).toBe(
      20.5 * HOUR,
    );
    expect(copenhagenDay(Date.UTC(2026, 2, 29, 22, 0))).toBe('2026-03-30');
  });

  it('fall-back day (25 Oct 2026) is 25 h long', () => {
    const midnight = Date.UTC(2026, 9, 24, 22, 0); // 00:00 CEST, 25 Oct
    expect(copenhagenDay(midnight)).toBe('2026-10-25');
    expect(msUntilCopenhagenMidnight(midnight)).toBe(25 * HOUR);
    expect(copenhagenDay(Date.UTC(2026, 9, 25, 22, 59))).toBe('2026-10-25');
    expect(copenhagenDay(Date.UTC(2026, 9, 25, 23, 0))).toBe('2026-10-26');
  });

  it('a capped reader is allowed again right at Copenhagen midnight', () => {
    const late = Date.UTC(2026, 2, 28, 22, 0); // 23:00 CET, 28 Mar (DST eve)
    const d = decide({
      state: null,
      now: late,
      limits,
      readToday: 150,
      alreadyReadToday: false,
    });
    expect(d).toMatchObject({ allowed: false, retryAfterMs: HOUR });
    const next = late + d.retryAfterMs;
    expect(copenhagenDay(next)).not.toBe(copenhagenDay(late));
  });
});

describe('reading-quota policy: escalating cooldowns (#32)', () => {
  const cooldown = READING_QUOTA_POLICY.cooldown;
  const DAY = 24 * HOUR;
  /** A request over the daily cap: always an overage, whatever the tokens. */
  const over = (state: QuotaState | null, now: number) =>
    decide({
      state,
      now,
      limits,
      cooldown,
      readToday: 150,
      alreadyReadToday: false,
    });
  /** A normal request (fresh chapter, nothing read today). */
  const read = (state: QuotaState | null, now: number) =>
    decide({ state, now, limits, cooldown, ...fresh });
  /** Strike `n` times, each just after the previous cooldown and throttle. */
  function strike(n: number, from = T0) {
    let state: QuotaState | null = null;
    let now = from;
    for (let i = 0; i < n; i++) {
      const d = over(state, now);
      state = d.next;
      now = Math.max(now + 10 * MIN, state.cooldownUntil);
    }
    return { state: state!, now };
  }

  it('policy = 1 min first, ×4 per strike, 24 h cap, ≤1 strike / 10 min, decay 1 / 24 h', () => {
    expect(cooldown).toEqual({
      firstMs: MIN,
      factor: 4,
      maxMs: DAY,
      strikeEveryMs: 10 * MIN,
      decayMs: DAY,
    });
  });

  it('a denial records a strike and starts a 1-minute cooldown', () => {
    // Pace overage: bucket empty
    let state: QuotaState | null = null;
    for (let i = 0; i < 20; i++) state = read(state, T0).next;
    const d = read(state, T0);
    expect(d).toMatchObject({ allowed: false, reason: 'pace' });
    expect(d.next).toMatchObject({ strikes: 1, cooldownUntil: T0 + MIN });
    // Retry-after is honest: the whole cooldown, not just the next token
    expect(d.retryAfterMs).toBe(MIN);
  });

  it('during cooldown: denied with reason cooldown, even with tokens to spare', () => {
    const first = over(null, T0);
    const d = read(first.next, T0 + 30_000);
    expect(d).toMatchObject({
      allowed: false,
      reason: 'cooldown',
      retryAfterMs: 30_000,
    });
    // Cooldown denials spend nothing either
    expect(d.next.tokens).toBe(limits.pace.burst);
    expect(read(d.next, T0 + MIN).allowed).toBe(true);
  });

  it('escalates 1m, 4m, 16m, 64m, 256m, 1024m, then caps at 24 h', () => {
    const lengths: number[] = [];
    let state: QuotaState | null = null;
    let now = T0;
    for (let i = 0; i < 9; i++) {
      state = over(state, now).next;
      lengths.push((state.cooldownUntil - now) / MIN);
      now = Math.max(now + 10 * MIN, state.cooldownUntil);
    }
    expect(lengths).toEqual([1, 4, 16, 64, 256, 1024, 1440, 1440, 1440]);
  });

  it('at most one strike per 10 minutes, however hard it is hammered', () => {
    let state = over(null, T0).next;
    for (let t = T0; t < T0 + 10 * MIN; t += 5_000) state = over(state, t).next;
    expect(state.strikes).toBe(1);
    state = over(state, T0 + 10 * MIN).next;
    expect(state).toMatchObject({
      strikes: 2,
      cooldownUntil: T0 + 10 * MIN + 4 * MIN,
    });
  });

  it('cooldown denials strike too, but no faster than the throttle', () => {
    // Strike 3 → 16 min cooldown; hammering it adds strike 4 only after 10 min
    const struck = strike(2);
    const now = struck.now;
    let state = struck.state;
    state = over(state, now).next;
    expect(state.strikes).toBe(3);
    const start = now;
    for (let t = start; t < start + 10 * MIN; t += 30_000) {
      const d = read(state, t);
      expect(d).toMatchObject({ allowed: false, reason: 'cooldown' });
      state = d.next;
    }
    expect(state.strikes).toBe(3);
    const d = read(state, start + 10 * MIN);
    expect(d.reason).toBe('cooldown');
    expect(d.next.strikes).toBe(4);
    // Escalated from the new strike: 64 min from now
    expect(d.retryAfterMs).toBe(64 * MIN);
  });

  it('strikes decay by one per 24 h without overage', () => {
    const { state } = strike(3);
    const lastStrike = state.lastStrikeAt!;
    // 47 h of quiet: one strike gone, the next overage is strike 3 (16 min)
    const now = lastStrike + 47 * HOUR;
    let d = read(state, now);
    expect(d.allowed).toBe(true);
    d = over(d.next, now);
    expect(d.next.strikes).toBe(3);
    expect(d.next.cooldownUntil - now).toBe(16 * MIN);
  });

  it('decay keeps counting across the quiet spell (no reset by allowed reads)', () => {
    let { state } = strike(2);
    const lastStrike = state.lastStrikeAt!;
    // Reads at 25 h and 49 h don't reset the clock: both strikes are gone
    state = read(state, lastStrike + 25 * HOUR).next;
    state = read(state, lastStrike + 49 * HOUR).next;
    // Clean slate: the next overage starts over at 1 minute
    const d = over(state, lastStrike + 50 * HOUR);
    expect(d.next.cooldownUntil - (lastStrike + 50 * HOUR)).toBe(MIN);
  });

  it('a strike right after a decay step still counts (throttle runs from the real last strike)', () => {
    const { state } = strike(1);
    const at = state.lastStrikeAt! + 24 * HOUR + 5 * MIN;
    const d = over(state, at);
    expect(d.next.cooldownUntil - at).toBe(MIN);
    expect(d.next.lastStrikeAt).toBe(at);
  });

  it('a daily denial keeps its reason and wait; the cooldown runs inside it', () => {
    const d = over(null, T0);
    expect(d).toMatchObject({
      allowed: false,
      reason: 'daily',
      retryAfterMs: 13 * HOUR,
    });
    expect(d.next.strikes).toBe(1);
  });

  it('cooldown reason wins, with the longest wait of all the limits hit', () => {
    // Daily-capped and in cooldown: reason cooldown, wait until midnight
    const first = over(null, T0);
    const d = over(first.next, T0 + 30_000);
    expect(d).toMatchObject({
      allowed: false,
      reason: 'cooldown',
      retryAfterMs: 13 * HOUR - 30_000,
    });
  });

  it('without a cooldown policy, denials never strike', () => {
    const d = decide({
      state: null,
      now: T0,
      limits,
      readToday: 150,
      alreadyReadToday: false,
    });
    expect(d.next.strikes).toBe(0);
    expect(decide({ state: d.next, now: T0, limits, ...fresh }).allowed).toBe(
      true,
    );
  });
});
