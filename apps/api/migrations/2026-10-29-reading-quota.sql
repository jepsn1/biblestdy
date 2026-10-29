-- #29 reading quotas: per-subject throttle state (additive only).
-- Subject = 'user:<id>' or 'ip:<address>'. NULL tokens = row just created by
-- the store's lock step, no state yet (policy treats it as a fresh subject).
-- Run on PROD before deploying this code (node apps/api/migrations/run.mjs),
-- else every chapter request errors on the missing table.

BEGIN;

CREATE TABLE IF NOT EXISTS reading_quota (
  subject text PRIMARY KEY,
  tokens integer,
  refilled_at bigint,
  updated_at timestamp NOT NULL DEFAULT now()
);

COMMIT;
