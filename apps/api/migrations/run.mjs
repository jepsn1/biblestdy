// Idempotent SQL migration runner: applies every migrations/*.sql not yet
// recorded in schema_migration, in filename order, each inside its file's own
// BEGIN/COMMIT. Usage: node migrations/run.mjs  (DATABASE_URL from env; pass
// --dry to list pending without applying).
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const dir = dirname(fileURLToPath(import.meta.url));
const dry = process.argv.includes('--dry');

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query(
    'CREATE TABLE IF NOT EXISTS schema_migration (name text PRIMARY KEY, applied_at timestamp NOT NULL DEFAULT now())',
  );
  const applied = new Set(
    (await client.query('SELECT name FROM schema_migration')).rows.map((r) => r.name),
  );
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`skip    ${file} (already applied)`);
      continue;
    }
    if (dry) {
      console.log(`pending ${file}`);
      continue;
    }
    const sql = await readFile(join(dir, file), 'utf8');
    await client.query(sql); // file carries its own BEGIN/COMMIT
    await client.query('INSERT INTO schema_migration (name) VALUES ($1)', [file]);
    console.log(`applied ${file}`);
  }
} finally {
  await client.end();
}
