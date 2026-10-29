import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ReadingQuotaPolicy } from './policy';
import {
  ReadingQuotaService,
  type QuotaCheck,
  type QuotaOutcome,
} from './service';
import type { QuotaStore } from './store';

/**
 * Tiny policy so tests stay short: account burst 3, one token per 10 s; IP
 * looser like the real one, burst 5, one token per 4 s.
 */
export const TEST_POLICY: ReadingQuotaPolicy = {
  account: { pace: { burst: 3, refillMs: 10_000 } },
  ip: { pace: { burst: 5, refillMs: 4_000 } },
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
    const service = (
      store = ctx.store(),
      warnings: string[] = [],
      policy = TEST_POLICY,
    ) =>
      new ReadingQuotaService({
        store,
        policy,
        now: clock,
        logger: { warn: (msg: string) => warnings.push(msg) },
      });
    const check = (): QuotaCheck => ({ userId: ctx.userId(), chapter });

    // Fresh addresses per test: the Postgres store keeps rows across tests
    let ipPrefix = '';
    beforeEach(() => {
      ipPrefix = `2001:db8:${randomUUID().slice(0, 4)}:${randomUUID().slice(0, 4)}::`;
    });
    const ip = (n = 1) => `${ipPrefix}${n}`;
    const user = (n: number) => `${ctx.userId()}-${n}`;
    const at = (u: number, addr: string | undefined): QuotaCheck => ({
      userId: user(u),
      ip: addr,
      chapter,
    });
    const run = async (s: ReadingQuotaService, c: QuotaCheck, n: number) => {
      const out: QuotaOutcome[] = [];
      for (let i = 0; i < n; i++) out.push(await s.check(c));
      return out;
    };

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

    describe('account + IP subjects (#31)', () => {
      it('IP limit blocks two accounts sharing one IP', async () => {
        const s = service();
        await run(s, at(1, ip()), 3);
        expect((await run(s, at(2, ip()), 2)).every((r) => r.allowed)).toBe(
          true,
        );
        expect(await s.check(at(2, ip()))).toEqual({
          allowed: false,
          reason: 'pace',
          retryAfterMs: 4_000,
          subject: `ip:${ip()}`,
        });
      });

      it('one account rotating IPs is still bound by account limits', async () => {
        const s = service();
        for (let n = 1; n <= 3; n++)
          expect((await s.check(at(1, ip(n)))).allowed).toBe(true);
        expect(await s.check(at(1, ip(4)))).toEqual({
          allowed: false,
          reason: 'pace',
          retryAfterMs: 10_000,
          subject: `user:${user(1)}`,
        });
      });

      it('longest retry-after wins when both deny (account longer)', async () => {
        const s = service();
        await run(s, at(1, ip()), 3);
        await run(s, at(2, ip()), 2);
        // account: 10 s to next token; IP: 4 s
        expect(await s.check(at(1, ip()))).toMatchObject({
          retryAfterMs: 10_000,
          subject: `user:${user(1)}`,
        });
      });

      it('longest retry-after wins when both deny (IP longer)', async () => {
        const slowIp: ReadingQuotaPolicy = {
          ...TEST_POLICY,
          ip: { pace: { burst: 5, refillMs: 60_000 } },
        };
        const s = service(ctx.store(), [], slowIp);
        await run(s, at(1, ip()), 3);
        await run(s, at(2, ip()), 2);
        expect(await s.check(at(1, ip()))).toMatchObject({
          retryAfterMs: 60_000,
          subject: `ip:${ip()}`,
        });
      });

      it("an account denial doesn't spend the IP's tokens", async () => {
        const s = service();
        await run(s, at(1, ip()), 3); // account 1 empty, IP has 2 left
        const denied = await run(s, at(1, ip()), 10);
        expect(denied.every((r) => !r.allowed)).toBe(true);
        const other = await run(s, at(2, ip()), 3);
        expect(other.map((r) => r.allowed)).toEqual([true, true, false]);
      });

      it("an IP denial doesn't spend the account's tokens", async () => {
        const s = service();
        await run(s, at(1, ip()), 3);
        await run(s, at(2, ip()), 2); // IP empty
        const denied = await run(s, at(3, ip()), 10);
        expect(denied.every((r) => !r.allowed)).toBe(true);
        const elsewhere = await run(s, at(3, ip(2)), 4);
        expect(elsewhere.map((r) => r.allowed)).toEqual([
          true,
          true,
          true,
          false,
        ]);
      });

      it('no IP → account limits only (no shared unknown-IP bucket)', async () => {
        const s = service();
        for (const addr of [undefined, '']) {
          for (let u = 1; u <= 6; u++)
            expect(
              (await s.check(at(u + (addr === '' ? 10 : 0), addr))).allowed,
            ).toBe(true);
        }
        await run(s, at(1, undefined), 2);
        expect(await s.check(at(1, undefined))).toMatchObject({
          allowed: false,
          subject: `user:${user(1)}`,
        });
      });
    });
  });
}
