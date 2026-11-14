-- Marked words on the user's data (additive only). NULL = not stored yet:
-- the reader backfills it lazily (PATCH quote) the next time the chapter loads.
-- quote = the anchored words as plain text (no verse numbers), so the command
-- palette can search highlights and annotations by what was marked.
-- Run on PROD before deploying this code (node apps/api/migrations/run.mjs),
-- else every highlight/annotation query errors on the missing column.

BEGIN;

ALTER TABLE highlight ADD COLUMN IF NOT EXISTS quote text;
ALTER TABLE annotation ADD COLUMN IF NOT EXISTS quote text;

COMMIT;
