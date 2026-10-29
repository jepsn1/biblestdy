import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe } from 'vitest';
import * as schema from '../db/schema';
import { DrizzleQuotaStore } from './drizzle.store';
import { quotaServiceContract } from './service.contract';

/**
 * Store integration (#29) against a throwaway schema in the DEV database: the
 * real migration file is applied there and dropped afterwards. Runs only when
 * DATABASE_URL names a dev/test database (never prod); skipped in CI.
 */
const url = process.env.DATABASE_URL ?? '';
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
    const sql = await readFile(
      join(__dirname, '../../migrations/2026-10-29-reading-quota.sql'),
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

  quotaServiceContract('Postgres store', () => {
    let userId = randomUUID();
    beforeEach(() => {
      userId = randomUUID();
    });
    // A new store object per call = a fresh app instance on the same DB
    return { store: () => new DrizzleQuotaStore(db), userId: () => userId };
  });
});
