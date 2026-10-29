import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '../db/schema';
import { DrizzleQuotaStore } from './drizzle.store';
import { ReadingQuotaService } from './service';
import { quotaServiceContract, TEST_POLICY } from './service.contract';

/**
 * Store integration (#29) against a throwaway schema in the DEV database: the
 * real migration file is applied there and dropped afterwards. Runs only when
 * DATABASE_URL names a dev/test database (never prod); skipped in CI.
 */
const url = process.env.DATABASE_URL ?? '';
const MIGRATIONS = [
  '2026-10-29-reading-quota.sql',
  '2026-10-29-reading-quota-day.sql',
  '2026-10-30-reading-quota-cooldown.sql',
];
const devDb = /\/[\w-]+_(dev|test)(\?|$)/.test(url);

describe.runIf(devDb)('Postgres quota store', () => {
  const testSchema = `quota_test_${randomUUID().slice(0, 8)}`;
  const admin = new Pool({ connectionString: url, max: 1 });
  const pool = new Pool({
    connectionString: url,
    max: 12,
    options: `-c search_path=${testSchema}`,
  });
  const db = drizzle(pool, { schema });

  beforeAll(async () => {
    await admin.query(`CREATE SCHEMA ${testSchema}`);
    for (const file of MIGRATIONS) {
      const sql = await readFile(
        join(__dirname, '../../migrations', file),
        'utf8',
      );
      await pool.query(sql);
      await pool.query(sql); // idempotent
    }
  });

  afterAll(async () => {
    await pool.end();
    await admin.query(`DROP SCHEMA ${testSchema} CASCADE`);
    await admin.end();
  });

  quotaServiceContract('Postgres store', () => {
    let userId = randomUUID();
    beforeEach(() => {
      userId = randomUUID();
    });
    // A new store object per call = a fresh app instance on the same DB
    return { store: () => new DrizzleQuotaStore(db), userId: () => userId };
  });

  describe('day reads + prune', () => {
    const chapter = (c: number) => ({
      translationId: 'WEB',
      book: 'JHN',
      chapter: c,
    });
    const days = async (subject: string) =>
      (
        await pool.query<{ day: string; n: number }>(
          `SELECT to_char(day, 'YYYY-MM-DD') AS day, count(*)::int AS n
             FROM reading_quota_day WHERE subject = $1 GROUP BY day ORDER BY day`,
          [subject],
        )
      ).rows;

    it('records each distinct chapter once per Copenhagen day', async () => {
      const userId = randomUUID();
      let now = Date.UTC(2026, 9, 28, 22, 30); // 23:30 CET, 28 Oct
      const s = new ReadingQuotaService({
        store: new DrizzleQuotaStore(db),
        policy: TEST_POLICY,
        now: () => now,
      });
      for (const c of [1, 2, 1]) {
        now += 10_000;
        await s.check({ userId, chapter: chapter(c) });
      }
      now = Date.UTC(2026, 9, 28, 23, 30); // 00:30 CET, 29 Oct
      await s.check({ userId, chapter: chapter(1) });
      expect(await days(`user:${userId}`)).toEqual([
        { day: '2026-10-28', n: 2 },
        { day: '2026-10-29', n: 1 },
      ]);
    });

    it('prune drops day reads older than 2 days and stale placeholders', async () => {
      const userId = randomUUID();
      const subject = `user:${userId}`;
      let now = 0;
      const s = new ReadingQuotaService({
        store: new DrizzleQuotaStore(db),
        policy: TEST_POLICY,
        now: () => now,
      });
      for (const d of [25, 26, 27, 28, 29]) {
        now = Date.UTC(2026, 9, d, 10, 0);
        await s.check({ userId, chapter: chapter(d) });
      }
      const placeholder = `ip:${randomUUID()}`;
      await pool.query(
        `INSERT INTO reading_quota (subject, updated_at) VALUES ($1, '2026-10-20')`,
        [placeholder],
      );
      await pool.query(
        `UPDATE reading_quota SET updated_at = '2026-10-20' WHERE subject = $1`,
        [subject],
      );
      now = Date.UTC(2026, 9, 29, 10, 0);
      await s.prune();
      expect((await days(subject)).map((r) => r.day)).toEqual([
        '2026-10-27',
        '2026-10-28',
        '2026-10-29',
      ]);
      const left = await pool.query<{ subject: string }>(
        'SELECT subject FROM reading_quota WHERE subject = ANY($1)',
        [[subject, placeholder]],
      );
      // State rows stay (may carry strikes); placeholders go
      expect(left.rows.map((r) => r.subject)).toEqual([subject]);
    });
  });
});
