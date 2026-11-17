-- #216 tag a mark: a note's inline ref may name one of the reader's marks
-- (the bible: link's title, "mark:hl:<uuid>" / "mark:pen:<uuid>"). Additive
-- and idempotent: two nullable columns, no backfill (bodies saved before
-- this carry no mark titles; any that do are indexed on their next save).
-- No foreign key: the id points at highlight or annotation by mark_kind,
-- and an erased mark must not take the ref with it (the reader falls back
-- to the verse and says "mark removed").
-- Run on PROD BEFORE deploying this code (node apps/api/migrations/run.mjs):
-- the note queries select these columns and would error without them.

BEGIN;

ALTER TABLE note_ref ADD COLUMN IF NOT EXISTS mark_kind text;
ALTER TABLE note_ref ADD COLUMN IF NOT EXISTS mark_id uuid;

COMMIT;
