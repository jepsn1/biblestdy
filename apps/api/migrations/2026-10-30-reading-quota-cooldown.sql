-- #32 escalating cooldowns: strike + cooldown state per quota subject
-- (additive only). strikes = count as of last_strike_at (decay is computed by
-- the API); cooldown_until = epoch ms the cooldown ends (0 = none). Run on PROD
-- before deploying this code (node apps/api/migrations/run.mjs), else every
-- chapter request errors on the missing columns.

BEGIN;

ALTER TABLE reading_quota ADD COLUMN IF NOT EXISTS strikes integer NOT NULL DEFAULT 0;
ALTER TABLE reading_quota ADD COLUMN IF NOT EXISTS last_strike_at bigint;
ALTER TABLE reading_quota ADD COLUMN IF NOT EXISTS cooldown_until bigint NOT NULL DEFAULT 0;

COMMIT;
