-- Single-key shortcuts switch (#145, WCAG 2.1.4 Character Key Shortcuts),
-- additive only: false = the reader's keys without Ctrl/⌘/Alt do nothing.
-- On by default. Run on PROD before deploying this code
-- (node apps/api/migrations/run.mjs), else GET /api/preferences errors on
-- the missing column.

BEGIN;

ALTER TABLE user_preference
  ADD COLUMN IF NOT EXISTS single_key_shortcuts boolean NOT NULL DEFAULT true;

COMMIT;
