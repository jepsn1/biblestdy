import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { SessionGuard, type AuthedRequest } from '../auth/session.guard';
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

  it('429s the 21st rapid chapter request with Retry-After + reason', async () => {
    const base = await start(true);
    for (let i = 0; i < 20; i++) {
      const ok = await fetch(`${base}/passages/WEB/JHN/3`);
      expect(ok.status).toBe(200);
    }
    const limited = await fetch(`${base}/passages/WEB/JHN/3`);
    expect(limited.status).toBe(429);
    // First strike: the wait covers the 1-minute cooldown it starts (#32)
    expect(limited.headers.get('retry-after')).toBe('60');
    expect(await limited.json()).toEqual({
      reason: 'pace',
      retryAfterSeconds: 60,
    });
  });

  it('429s with reason cooldown while a cooldown runs (#32)', async () => {
    let now = Date.UTC(2026, 9, 29, 10, 0);
    const base = await start(
      true,
      new ReadingQuotaService({
        store: new InMemoryQuotaStore(),
        now: () => now,
      }),
    );
    for (let i = 0; i < 21; i++) await fetch(`${base}/passages/WEB/JHN/3`);
    now += 45_000; // tokens back, cooldown not over
    const limited = await fetch(`${base}/passages/WEB/JHN/3`);
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
