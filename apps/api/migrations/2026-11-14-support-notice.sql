-- One-time support notice (additive only). NULL = not dismissed yet.
-- Run on PROD before deploying this code (node apps/api/migrations/run.mjs),
-- else GET /api/preferences errors on the missing column.

BEGIN;

ALTER TABLE user_preference
  ADD COLUMN IF NOT EXISTS support_notice_dismissed_at timestamp;

COMMIT;
