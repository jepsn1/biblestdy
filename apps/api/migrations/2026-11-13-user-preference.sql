-- #45 reader style: per-account preferences (additive only). No row / NULL
-- reader_style = never chosen → the web app shows the onboarding chooser.
-- Run on PROD before deploying this code (node apps/api/migrations/run.mjs),
-- else GET /api/preferences errors on the missing table.

BEGIN;

CREATE TABLE IF NOT EXISTS user_preference (
  user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  reader_style text CHECK (reader_style IN ('paper', 'clean')),
  updated_at timestamp NOT NULL DEFAULT now()
);

COMMIT;
