-- #64 soft delete + undo (additive only). deleted_at NULL = live row.
-- DELETE /api/{highlights,annotations,notes}/:id now sets deleted_at; the
-- matching POST …/:id/restore clears it. TrashPurgeSchedule hard-deletes rows
-- soft-deleted more than an hour ago (cascades as before).
-- Run on PROD before deploying this code (node apps/api/migrations/run.mjs),
-- else every list/delete query errors on the missing column.

BEGIN;

ALTER TABLE highlight ADD COLUMN IF NOT EXISTS deleted_at timestamp;
ALTER TABLE annotation ADD COLUMN IF NOT EXISTS deleted_at timestamp;
ALTER TABLE note ADD COLUMN IF NOT EXISTS deleted_at timestamp;

-- The purge scans for old tombstones; live rows (the vast majority) stay out
CREATE INDEX IF NOT EXISTS highlight_deleted_at_idx ON highlight (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS annotation_deleted_at_idx ON annotation (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS note_deleted_at_idx ON note (deleted_at) WHERE deleted_at IS NOT NULL;

COMMIT;
