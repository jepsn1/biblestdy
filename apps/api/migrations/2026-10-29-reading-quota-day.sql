-- #30 daily cap: which distinct chapters each quota subject read on which
-- Copenhagen calendar day (additive only). Independent of reading_quota (no
-- FK), so file order doesn't matter. Rows older than 2 days are pruned by the
-- API. Run on PROD before deploying this code (node apps/api/migrations/run.mjs),
-- else every chapter request errors on the missing table.

BEGIN;

CREATE TABLE IF NOT EXISTS reading_quota_day (
  subject text NOT NULL,
  day date NOT NULL,
  translation_id text NOT NULL,
  book text NOT NULL,
  chapter integer NOT NULL,
  PRIMARY KEY (subject, day, translation_id, book, chapter)
);

CREATE INDEX IF NOT EXISTS reading_quota_day_day_idx ON reading_quota_day (day);

COMMIT;
