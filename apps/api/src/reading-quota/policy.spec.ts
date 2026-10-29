import { describe, expect, it } from 'vitest';
import {
  decide,
  READING_QUOTA_POLICY,
  type QuotaDecision,
  type QuotaState,
  type SubjectLimits,
} from './policy';

/** Reading-quota policy (#29): pure token-bucket pace limit, injected clock. */
const limits: SubjectLimits = READING_QUOTA_POLICY.account;
const T0 = Date.UTC(2026, 9, 29, 10, 0, 0);

/** Fire `n` requests at `now`, threading state; returns the decisions. */
function burst(state: QuotaState | null, n: number, now: number) {
  const out: QuotaDecision[] = [];
  for (let i = 0; i < n; i++) {
    const d = decide({ state, now, limits });
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

  it('allows a fresh subject a full burst, then denies with reason pace', () => {
    const { decisions } = burst(null, 21, T0);
    expect(decisions.slice(0, 20).every((d) => d.allowed)).toBe(true);
    expect(decisions[20]).toMatchObject({ allowed: false, reason: 'pace' });
  });

  it('says exactly how long until the next token', () => {
    const { state } = burst(null, 20, T0);
    const d = decide({ state, now: T0 + 1000, limits });
    expect(d).toMatchObject({ allowed: false, retryAfterMs: 2000 });
  });

  it('refills one token per 3 s, never above the burst', () => {
    let { state } = burst(null, 20, T0);
    expect(burst(state, 2, T0 + 3000).decisions.map((d) => d.allowed)).toEqual(
      [true, false],
    );
    ({ state } = burst(state, 2, T0 + 3 * 3000));
    expect(burst(state, 4, T0 + 3 * 3000).decisions.map((d) => d.allowed)).toEqual(
      [true, false, false, false],
    );
    // An hour idle tops up to the burst, not to 1200
    const idle = burst(state, 21, T0 + 3_600_000).decisions;
    expect(idle.filter((d) => d.allowed)).toHaveLength(20);
  });

  it('keeps partial refill progress across allowed requests', () => {
    let { state } = burst(null, 20, T0);
    // 4.5 s later: one token earned, 1.5 s banked toward the next
    ({ state } = burst(state, 1, T0 + 4500));
    const d = decide({ state, now: T0 + 4500, limits });
    expect(d).toMatchObject({ allowed: false, retryAfterMs: 1500 });
  });

  it('denied requests consume nothing (hammering does not delay the next token)', () => {
    const { state } = burst(null, 20, T0);
    let s = state;
    for (let t = T0; t < T0 + 3000; t += 100) {
      const d = decide({ state: s, now: t, limits });
      expect(d.allowed).toBe(false);
      s = d.next; // even persisting denial state must not cost tokens
    }
    expect(decide({ state: s, now: T0 + 3000, limits }).allowed).toBe(true);
  });

  it('a steady human pace (1 chapter / 3 s) is never limited', () => {
    let state: QuotaState | null = null;
    for (let i = 0; i < 500; i++) {
      const d = decide({ state, now: T0 + i * 3000, limits });
      expect(d.allowed).toBe(true);
      state = d.next;
    }
  });
});
