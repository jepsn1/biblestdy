-- Renamable highlight colours (additive only): a reader's own names, e.g.
-- {"blue": "God speaking"}. Only renamed colours are stored; a missing key =
-- the colour's own name in the UI language ({} = all default).
-- Run on PROD before deploying this code (node apps/api/migrations/run.mjs),
-- else GET /api/preferences errors on the missing column.

BEGIN;

ALTER TABLE user_preference
  ADD COLUMN IF NOT EXISTS highlight_labels jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMIT;
