-- #61 in-app text size (additive only). NULL text_size = never changed → 100%.
-- "_" (not "-") so it sorts AFTER 2026-11-13-user-preference.sql (needs its table).
-- Run on PROD before deploying this code (node apps/api/migrations/run.mjs),
-- else GET /api/preferences errors on the missing column.

BEGIN;

ALTER TABLE user_preference
  ADD COLUMN IF NOT EXISTS text_size smallint
  CHECK (text_size IN (100, 125, 150, 175, 200));

COMMIT;
