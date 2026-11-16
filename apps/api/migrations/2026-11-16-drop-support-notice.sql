-- Drop the retired one-time support notice's column (the notice itself went
-- in #151; nothing reads or writes support_notice_dismissed_at any more).
-- Order matters, unlike the additive migrations: DEPLOY THIS CODE FIRST,
-- then run it on PROD (node apps/api/migrations/run.mjs) — the code still
-- running before the deploy selects the column.
-- Down-safe: IF EXISTS makes it re-runnable, and rolling the code back only
-- needs the column again (no data worth keeping: dismissal timestamps of a
-- notice that no longer shows):
--   ALTER TABLE user_preference ADD COLUMN IF NOT EXISTS support_notice_dismissed_at timestamp;

BEGIN;

ALTER TABLE user_preference
  DROP COLUMN IF EXISTS support_notice_dismissed_at;

COMMIT;
