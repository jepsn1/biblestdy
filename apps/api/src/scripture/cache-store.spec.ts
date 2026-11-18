import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '../db/schema';
import { DrizzleCacheStore, type CacheEntry } from './cache-store';
import { CachingScriptureProvider } from './caching.provider';
import { FakeScriptureProvider } from './fake.provider';

/**
 * Persistent Scripture cache (#248) against a throwaway schema in the DEV
 * database: the real migration is applied (twice: idempotent) and dropped
 * afterwards. Runs only when DATABASE_URL names a dev/test database.
 */
const url = process.env.DATABASE_URL ?? '';
const devDb = /\/[\w-]+_(dev|test)(\?|$)/.test(url);

describe.runIf(devDb)('Postgres scripture cache store', () => {
  const testSchema = `scache_test_${randomUUID().slice(0, 8)}`;
  const admin = new Pool({ connectionString: url, max: 1 });
  const pool = new Pool({
    connectionString: url,
    max: 8,
    options: `-c search_path=${testSchema}`,
  });
  const db = drizzle(pool, { schema });
  const store = new DrizzleCacheStore(db);

  beforeAll(async () => {
    await admin.query(`CREATE SCHEMA ${testSchema}`);
    const sql = await readFile(
      join(__dirname, '../../migrations/2026-11-18-scripture-cache.sql'),
      'utf8',
    );
    await pool.query(sql);
    await pool.query(sql); // idempotent
  });

  afterAll(async () => {
    await pool.end();
    await admin.query(`DROP SCHEMA ${testSchema} CASCADE`);
    await admin.end();
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE scripture_cache, scripture_upstream_call');
  });

  const chapter = (translationId: string, n: number): CacheEntry => ({
    kind: 'chapter',
    translationId,
    payload: { translationId, book: 'JHN', chapter: n, verses: [] },
    fumsToken: `tok-${n}`,
    fetchedAt: Date.UTC(2026, 10, 18, 12, 0, 0, 123),
  });

  it('round-trips an entry (token, ms timestamp) and upserts', async () => {
    await store.put(
      'apibible:chapter:NIV/JHN.3',
      'apibible',
      chapter('NIV', 3),
    );
    expect(await store.get('apibible:chapter:NIV/JHN.3')).toEqual(
      chapter('NIV', 3),
    );
    await store.put('apibible:chapter:NIV/JHN.3', 'apibible', {
      ...chapter('NIV', 3),
      fumsToken: 'tok-new',
    });
    expect((await store.get('apibible:chapter:NIV/JHN.3'))?.fumsToken).toBe(
      'tok-new',
    );
    expect(await store.get('apibible:chapter:NIV/JHN.4')).toBeNull();
  });

  it('purges one translation (+ the list) of one source only', async () => {
    await store.put(
      'apibible:chapter:NIV/JHN.3',
      'apibible',
      chapter('NIV', 3),
    );
    await store.put(
      'apibible:chapter:NIV/JHN.4',
      'apibible',
      chapter('NIV', 4),
    );
    await store.put(
      'apibible:chapter:WEB/JHN.3',
      'apibible',
      chapter('WEB', 3),
    );
    await store.put('fake:chapter:NIV/JHN.3', 'fake', chapter('NIV', 3));
    await store.put('apibible:translations', 'apibible', {
      kind: 'translations',
      translationId: null,
      payload: [],
      fumsToken: null,
      fetchedAt: Date.now(),
    });
    expect(await store.purge('apibible', 'NIV')).toBe(2);
    expect(await store.get('apibible:translations')).toBeNull();
    expect(await store.get('apibible:chapter:WEB/JHN.3')).not.toBeNull();
    expect(await store.get('fake:chapter:NIV/JHN.3')).not.toBeNull();
    expect(await store.purge('apibible')).toBe(1);
  });

  it('counts concurrent calls exactly, per day and month', async () => {
    await Promise.all(
      Array.from({ length: 20 }, () =>
        store.countCall('apibible', '2026-11-18'),
      ),
    );
    await store.countCall('apibible', '2026-11-02');
    await store.countCall('apibible', '2026-10-31');
    await store.countCall('fake', '2026-11-18');
    expect(await store.calls('apibible', '2026-11-18')).toEqual({
      today: 20,
      month: 21,
    });
    expect(await store.calls('apibible', '2026-11-19')).toEqual({
      today: 0,
      month: 21,
    });
  });

  it('two processes on one database share one fetch', async () => {
    let calls = 0;
    const fake = new FakeScriptureProvider();
    const counting = {
      listTranslations: () => fake.listTranslations(),
      getChapter: (t: string, b: string, c: number) => {
        calls++;
        return fake.getChapter(t, b, c);
      },
    };
    const a = new CachingScriptureProvider(counting, { source: 'fake', store });
    const b = new CachingScriptureProvider(counting, { source: 'fake', store });
    const first = await a.getChapter('WEB', 'JHN', 3);
    const second = await b.getChapter('WEB', 'JHN', 3);
    expect(second).toEqual(first);
    expect(calls).toBe(1);
    expect((await b.stats()).today).toBe(1);
  });
});
