-- #28 Better Auth rate limiting, database storage (additive only).
-- Run on PROD before deploying this code (node apps/api/migrations/run.mjs),
-- else every /api/auth request errors on the missing table.

BEGIN;

CREATE TABLE IF NOT EXISTS rate_limit (
  id text PRIMARY KEY,
  key text NOT NULL UNIQUE,
  count integer NOT NULL,
  last_request bigint NOT NULL
);

COMMIT;
