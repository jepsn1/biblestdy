import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { SessionGuard, type AuthedRequest } from '../auth/session.guard';
import { READING_QUOTA_POLICY } from '../reading-quota/policy';
import { ReadingQuotaService } from '../reading-quota/service';
import { InMemoryQuotaStore } from '../reading-quota/store';
import { FakeScriptureProvider } from './fake.provider';
import { SCRIPTURE_PROVIDER } from './provider';
import { ScriptureController } from './scripture.controller';

/**
 * Scripture access gate: text only for signed-in sessions (#26), chapter
 * requests paced, daily-capped and cooled down by the reading quota (#29, #30,
 * #32; in-memory store).
 */
describe('Scripture access gate (HTTP, fake provider)', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  async function start(
    signedIn: boolean,
    quota = new ReadingQuotaService({ store: new InMemoryQuotaStore() }),
  ): Promise<string> {
    let builder = Test.createTestingModule({
      controllers: [ScriptureController],
      providers: [
        { provide: SCRIPTURE_PROVIDER, useValue: new FakeScriptureProvider() },
        {
          provide: ReadingQuotaService,
          useValue: quota,
        },
      ],
    });
    // Signed out → the real guard (no cookie, so no DB lookup happens).
    // Signed in → stand-in guard that accepts the request.
    if (signedIn)
      builder = builder.overrideGuard(SessionGuard).useValue({
        canActivate: (ctx: ExecutionContext) => {
          ctx.switchToHttp().getRequest<AuthedRequest>().user = {
            id: 'reader-1',
            email: 'reader@example.com',
            name: 'Reader',
          };
          return true;
        },
      });
    const moduleRef = await builder.compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.listen(0);
    return app.getUrl();
  }

  it('401s the chapter endpoint without a session', async () => {
    const base = await start(false);
    const res = await fetch(`${base}/passages/WEB/JHN/3`);
    expect(res.status).toBe(401);
  });

  it('401s the translations list without a session', async () => {
    const base = await start(false);
    const res = await fetch(`${base}/translations`);
    expect(res.status).toBe(401);
  });

  it('serves chapter + translations as before when signed in', async () => {
    const base = await start(true);
    const chapter = await fetch(`${base}/passages/WEB/JHN/3`);
    expect(chapter.status).toBe(200);
    expect(await chapter.json()).toMatchObject({
      translationId: 'WEB',
      book: 'JHN',
      chapter: 3,
    });
    const translations = await fetch(`${base}/translations`);
    expect(translations.status).toBe(200);
    expect(await translations.json()).toHaveLength(2);
  });

  /** Distinct chapters (re-reads are free); the fake only has a few, so a
   * 404 past the quota check is fine — what matters is "not 429". */
  const psalm = (base: string, n: number) =>
    fetch(`${base}/passages/WEB/PSA/${n}`);

  it('429s the 31st rapid distinct chapter with Retry-After + reason', async () => {
    const base = await start(true);
    for (let i = 1; i <= 30; i++)
      expect((await psalm(base, i)).status).not.toBe(429);
    const limited = await psalm(base, 31);
    expect(limited.status).toBe(429);
    // First strike is forgiven: just the 2 s to the next token
    expect(limited.headers.get('retry-after')).toBe('2');
    expect(await limited.json()).toEqual({
      reason: 'pace',
      retryAfterSeconds: 2,
    });
  });

  it('tells the reader how many chapters are left in the burst', async () => {
    const base = await start(true);
    const first = await fetch(`${base}/passages/WEB/JHN/3`);
    expect(first.headers.get('ratelimit-remaining')).toBe('29');
  });

  it('re-reading a chapter already read today never runs out', async () => {
    const base = await start(true);
    for (let i = 0; i < 40; i++)
      expect((await fetch(`${base}/passages/WEB/JHN/3`)).status).toBe(200);
  });

  it('429s with reason cooldown while a cooldown runs (#32)', async () => {
    let now = Date.UTC(2026, 9, 29, 10, 0);
    const base = await start(
      true,
      new ReadingQuotaService({
        store: new InMemoryQuotaStore(),
        policy: {
          ...READING_QUOTA_POLICY,
          cooldown: { ...READING_QUOTA_POLICY.cooldown!, graceStrikes: 0 },
        },
        now: () => now,
      }),
    );
    for (let i = 1; i <= 31; i++) await psalm(base, i);
    now += 45_000; // tokens back, cooldown not over
    const limited = await psalm(base, 32);
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('15');
    expect(await limited.json()).toEqual({
      reason: 'cooldown',
      retryAfterSeconds: 15,
    });
    now += 15_000;
    expect((await fetch(`${base}/passages/WEB/JHN/3`)).status).toBe(200);
  });

  it('429s a distinct chapter over the daily cap until Copenhagen midnight', async () => {
    const base = await start(
      true,
      new ReadingQuotaService({
        store: new InMemoryQuotaStore(),
        policy: {
          account: { pace: { burst: 100, refillMs: 1000 }, dailyChapters: 2 },
          ip: { pace: { burst: 100, refillMs: 1000 }, dailyChapters: 100 },
          cooldown: null,
        },
        now: () => Date.UTC(2026, 9, 29, 22, 30), // 23:30 Copenhagen
      }),
    );
    for (const path of ['GEN/1', 'PSA/23'])
      expect((await fetch(`${base}/passages/WEB/${path}`)).status).toBe(200);
    const limited = await fetch(`${base}/passages/WEB/JHN/3`);
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('1800');
    expect(await limited.json()).toEqual({
      reason: 'daily',
      retryAfterSeconds: 1800,
    });
    // Re-opening a chapter already read today is free
    expect((await fetch(`${base}/passages/WEB/GEN/1`)).status).toBe(200);
  });

  it('never throttles the translations list', async () => {
    const base = await start(true);
    for (let i = 0; i < 30; i++) {
      const res = await fetch(`${base}/translations`);
      expect(res.status).toBe(200);
    }
  });
});
