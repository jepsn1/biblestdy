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
 * Tiny policy so tests stay short: account burst 3, one token per 10 s, 5
 * distinct chapters/day; IP looser like the real one, burst 5, one token per
 * 4 s, 8 distinct chapters/day.
 */
export const TEST_POLICY: ReadingQuotaPolicy = {
  account: { pace: { burst: 3, refillMs: 10_000 }, dailyChapters: 5 },
  ip: { pace: { burst: 5, refillMs: 4_000 }, dailyChapters: 8 },
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

    /** Read chapters 1..n of John, 10 s apart (never pace-limited). */
    async function readDistinct(s: ReadingQuotaService, n: number) {
      const out: QuotaOutcome[] = [];
      for (let c = 1; c <= n; c++) {
        now += 10_000;
        out.push(
          await s.check({ ...check(), chapter: { ...chapter, chapter: c } }),
        );
      }
      return out;
    }

    it('caps distinct chapters per day; retry-after runs to Copenhagen midnight', async () => {
      const s = service();
      now = Date.UTC(2026, 9, 29, 10, 0, 0); // 11:00 CET
      const results = await readDistinct(s, 6);
      expect(results.slice(0, 5).every((r) => r.allowed)).toBe(true);
      // Next Copenhagen midnight = 23:00 UTC
      expect(results[5]).toEqual({
        allowed: false,
        reason: 'daily',
        retryAfterMs: Date.UTC(2026, 9, 29, 23, 0, 0) - now,
        subject: `user:${ctx.userId()}`,
      });
    });

    it('re-reading a chapter already read today is free; other translations are distinct', async () => {
      const s = service();
      await readDistinct(s, 5);
      now += 10_000;
      expect(
        (await s.check({ ...check(), chapter: { ...chapter, chapter: 2 } }))
          .allowed,
      ).toBe(true);
      now += 10_000;
      const otherTranslation = { ...chapter, translationId: 'NIV', chapter: 2 };
      expect(
        await s.check({ ...check(), chapter: otherTranslation }),
      ).toMatchObject({
        allowed: false,
        reason: 'daily',
      });
    });

    it('a denied chapter is not recorded as read', async () => {
      const s = service();
      await readDistinct(s, 5);
      now += 10_000;
      const sixth = { ...check(), chapter: { ...chapter, chapter: 6 } };
      expect((await s.check(sixth)).allowed).toBe(false);
      now += 10_000;
      expect((await s.check(sixth)).allowed).toBe(false);
    });

    it('the cap resets at Copenhagen midnight and survives a restart', async () => {
      const store = ctx.store();
      now = Date.UTC(2026, 9, 29, 22, 0, 0); // 23:00 CET
      await readDistinct(service(store), 5);
      now += 10_000;
      const sixth = { ...check(), chapter: { ...chapter, chapter: 6 } };
      expect((await service(ctx.store()).check(sixth)).allowed).toBe(false);
      now = Date.UTC(2026, 9, 29, 23, 0, 0); // midnight Copenhagen
      expect((await service(ctx.store()).check(sixth)).allowed).toBe(true);
    });

    it('concurrent distinct chapters never exceed the cap', async () => {
      now += 3_600_000; // full bucket
      const results = await Promise.all(
        Array.from({ length: 3 }, (_, i) =>
          service(ctx.store()).check({
            ...check(),
            chapter: { ...chapter, chapter: 10 + i },
          }),
        ),
      );
      expect(results.every((r) => r.allowed)).toBe(true);
      now += 3_600_000;
      const more = await Promise.all(
        Array.from({ length: 3 }, (_, i) =>
          service(ctx.store()).check({
            ...check(),
            chapter: { ...chapter, chapter: 20 + i },
          }),
        ),
      );
      expect(more.filter((r) => r.allowed)).toHaveLength(2);
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
          ip: { ...TEST_POLICY.ip, pace: { burst: 5, refillMs: 60_000 } },
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

      /** `u` reads chapters `cs` of John via `addr`, 10 s apart. */
      const readVia = async (
        s: ReadingQuotaService,
        u: number,
        addr: string,
        cs: number[],
      ) => {
        const out: QuotaOutcome[] = [];
        for (const c of cs) {
          now += 10_000;
          out.push(
            await s.check({
              ...at(u, addr),
              chapter: { ...chapter, chapter: c },
            }),
          );
        }
        return out;
      };

      it('IP daily cap counts distinct chapters across accounts sharing it', async () => {
        const s = service();
        now = Date.UTC(2026, 9, 29, 10, 0, 0);
        await readVia(s, 1, ip(), [1, 2, 3, 4, 5]); // IP: 5 distinct
        // Account 2 re-reading 1–5 is new for it, free for the IP
        const again = await readVia(s, 2, ip(), [1, 2, 3, 4, 5]);
        expect(again.every((r) => r.allowed)).toBe(true);
        // Account 3: 6–8 fill the IP's 8, the 9th distinct is denied
        const more = await readVia(s, 3, ip(), [6, 7, 8, 9]);
        expect(more.slice(0, 3).every((r) => r.allowed)).toBe(true);
        expect(more[3]).toEqual({
          allowed: false,
          reason: 'daily',
          retryAfterMs: Date.UTC(2026, 9, 29, 23, 0, 0) - now,
          subject: `ip:${ip()}`,
        });
        // Same account elsewhere is fine
        expect((await readVia(s, 3, ip(2), [9]))[0].allowed).toBe(true);
      });

      it('IPv4-mapped IPv6 and plain IPv4 are one subject', async () => {
        const s = service();
        // Random 10/8 address: the Postgres store keeps rows across runs
        const octet = () => Math.floor(Math.random() * 256);
        const v4 = `10.${octet()}.${octet()}.${octet()}`;
        await run(s, at(1, `::ffff:${v4}`), 3);
        await run(s, at(2, v4), 2);
        expect(await s.check(at(2, `::FFFF:${v4}`))).toEqual({
          allowed: false,
          reason: 'pace',
          retryAfterMs: 4_000,
          subject: `ip:${v4}`,
        });
      });
    });
  });
}
