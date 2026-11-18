-- #248 persistent shared Scripture cache + upstream call counter (additive).
-- scripture_cache: chapters + the translations list as fetched from the
-- provider, keyed "<source>:chapter:<translationId>/<BOOK>.<n>" or
-- "<source>:translations". source = 'apibible' | 'fake' (a keyless dev server
-- never mixes fixtures into real entries). payload = the Chapter (or
-- Translation[]) without its FUMS token, which sits in fums_token. Rows are
-- never served older than 25 days (ToS §11); purge deletes them (§10.3, §13.2).
-- scripture_upstream_call: provider calls per UTC day and source (soft budget,
-- stats endpoint).
-- Run BEFORE deploying this code (node apps/api/migrations/run.mjs). Without
-- the tables the API still serves text (memory + API.Bible) but logs errors.

BEGIN;

CREATE TABLE IF NOT EXISTS scripture_cache (
  key text PRIMARY KEY,
  source text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('chapter', 'translations')),
  translation_id text,
  payload jsonb NOT NULL,
  fums_token text,
  fetched_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS scripture_cache_translation_idx
  ON scripture_cache (source, translation_id);

CREATE TABLE IF NOT EXISTS scripture_upstream_call (
  day date NOT NULL,
  source text NOT NULL,
  calls integer NOT NULL DEFAULT 0,
  PRIMARY KEY (day, source)
);

COMMIT;
