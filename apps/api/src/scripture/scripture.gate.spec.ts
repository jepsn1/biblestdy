import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { SessionGuard } from '../auth/session.guard';
import { FakeScriptureProvider } from './fake.provider';
import { SCRIPTURE_PROVIDER } from './provider';
import { ScriptureController } from './scripture.controller';

/** Scripture access gate (#26): text is only served to signed-in sessions. */
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
      ],
    });
    // Signed out → the real guard (no cookie, so no DB lookup happens).
    // Signed in → stand-in guard that accepts the request.
    if (signedIn)
      builder = builder
        .overrideGuard(SessionGuard)
        .useValue({ canActivate: () => true });
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
});
