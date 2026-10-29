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
 * requests paced by the reading quota (#29, real policy, in-memory store).
 */
describe('Scripture access gate (HTTP, fake provider)', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  async function start(signedIn: boolean): Promise<string> {
    let builder = Test.createTestingModule({
      controllers: [ScriptureController],
      providers: [
        { provide: SCRIPTURE_PROVIDER, useValue: new FakeScriptureProvider() },
        {
          provide: ReadingQuotaService,
          useValue: new ReadingQuotaService({
            store: new InMemoryQuotaStore(),
          }),
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
    const retryAfter = Number(limited.headers.get('retry-after'));
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(retryAfter).toBeLessThanOrEqual(3);
    expect(await limited.json()).toEqual({
      reason: 'pace',
      retryAfterSeconds: retryAfter,
    });
  });

  it('never throttles the translations list', async () => {
    const base = await start(true);
    for (let i = 0; i < 30; i++) {
      const res = await fetch(`${base}/translations`);
      expect(res.status).toBe(200);
    }
  });
});
