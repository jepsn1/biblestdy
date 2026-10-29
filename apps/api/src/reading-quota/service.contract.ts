import { describe, expect, it } from 'vitest';
import type { ReadingQuotaPolicy } from './policy';
import { ReadingQuotaService, type QuotaCheck } from './service';
import type { QuotaStore } from './store';

/** Tiny policy so tests stay short: burst 3, one token per 10 s. */
export const TEST_POLICY: ReadingQuotaPolicy = {
  account: { pace: { burst: 3, refillMs: 10_000 } },
};

const chapter = { translationId: 'WEB', book: 'JHN', chapter: 3 };

/**
 * Reading-quota service behaviour against a given store. Runs against the
 * in-memory store (always) and Postgres (when a dev DB is available), so both
 * stores honour the same contract.
 */
export function quotaServiceContract(
  name: string,
  setup: () => { store: () => QuotaStore; userId: () => string },
): void {
  describe(`reading-quota service (${name})`, () => {
    const ctx = setup();
    let now = Date.UTC(2026, 9, 29, 10, 0, 0);
    const clock = () => now;
    const service = (store = ctx.store(), warnings: string[] = []) =>
      new ReadingQuotaService({
        store,
        policy: TEST_POLICY,
        now: clock,
        logger: { warn: (msg: string) => warnings.push(msg) },
      });
    const check = (): QuotaCheck => ({ userId: ctx.userId(), chapter });

    it('allows the burst, then denies with pace + retry-after', async () => {
      const s = service();
      for (let i = 0; i < 3; i++)
        expect(await s.check(check())).toEqual({ allowed: true });
      expect(await s.check(check())).toEqual({
        allowed: false,
        reason: 'pace',
        retryAfterMs: 10_000,
        subject: `user:${ctx.userId()}`,
      });
    });

    it('refills with the injected clock', async () => {
      const s = service();
      for (let i = 0; i < 4; i++) await s.check(check());
      now += 10_000;
      expect((await s.check(check())).allowed).toBe(true);
      expect((await s.check(check())).allowed).toBe(false);
    });

    it('logs every denial with subject, reason and retry-after', async () => {
      const warnings: string[] = [];
      const s = service(ctx.store(), warnings);
      for (let i = 0; i < 5; i++) await s.check(check());
      expect(warnings).toHaveLength(2);
      expect(warnings[0]).toContain(`subject=user:${ctx.userId()}`);
      expect(warnings[0]).toContain('reason=pace');
      expect(warnings[0]).toContain('retryAfterMs=10000');
    });

    it('state survives a fresh service instance (restart)', async () => {
      const store = ctx.store();
      for (let i = 0; i < 3; i++) await service(store).check(check());
      expect((await service(ctx.store()).check(check())).allowed).toBe(false);
    });

    it('keeps subjects apart', async () => {
      const s = service();
      for (let i = 0; i < 3; i++) await s.check(check());
      const other = { ...check(), userId: `${ctx.userId()}-other` };
      expect((await s.check(other)).allowed).toBe(true);
    });

    it('concurrent requests never double-spend', async () => {
      const results = await Promise.all(
        Array.from({ length: 12 }, () => service(ctx.store()).check(check())),
      );
      expect(results.filter((r) => r.allowed)).toHaveLength(3);
    });
  });
}
