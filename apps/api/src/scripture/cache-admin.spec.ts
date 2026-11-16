import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CacheAdminController, purgeKey } from './cache-admin.controller';
import { CachingScriptureProvider } from './caching.provider';
import { CopyrightController } from './copyright.controller';
import { FakeScriptureProvider } from './fake.provider';
import { SCRIPTURE_PROVIDER } from './provider';

describe('Scripture cache purge + copyright list (HTTP)', () => {
  let app: INestApplication | undefined;
  const saved = process.env.BETTER_AUTH_SECRET;
  beforeEach(() => {
    process.env.BETTER_AUTH_SECRET = 'test-secret';
  });
  afterEach(async () => {
    process.env.BETTER_AUTH_SECRET = saved;
    await app?.close();
    app = undefined;
  });

  async function start() {
    const cache = new CachingScriptureProvider(new FakeScriptureProvider());
    const moduleRef = await Test.createTestingModule({
      controllers: [CacheAdminController, CopyrightController],
      providers: [{ provide: SCRIPTURE_PROVIDER, useValue: cache }],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1');
    return { base: await app.getUrl(), cache };
  }

  const purge = (base: string, key: string | null, translationId?: string) =>
    fetch(`${base}/admin/scripture-cache/purge`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(key !== null && { 'x-purge-key': key }),
      },
      body: JSON.stringify({ translationId }),
    });

  it('purges one translation with the server-derived key', async () => {
    const { base, cache } = await start();
    await cache.getChapter('WEB', 'JHN', 3);
    await cache.getChapter('WEB2', 'JHN', 3);
    const res = await purge(base, purgeKey('test-secret'), 'WEB');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ purged: 1, translationId: 'WEB' });
  });

  it('refuses without the key or with a wrong one', async () => {
    const { base } = await start();
    expect((await purge(base, null)).status).toBe(403);
    expect((await purge(base, purgeKey('guess'))).status).toBe(403);
  });

  it('lists copyright lines without a session', async () => {
    const { base } = await start();
    const list = (await (await fetch(`${base}/copyright`)).json()) as {
      abbreviation: string;
      copyright?: string;
    }[];
    expect(list[0]).toMatchObject({
      abbreviation: 'WEB',
      copyright: 'PUBLIC DOMAIN',
    });
  });
});
