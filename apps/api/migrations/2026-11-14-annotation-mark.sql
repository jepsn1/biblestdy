-- Pen marks (additive only): an annotation's mark style, and text becomes
-- optional — a mark without text is a plain pen mark (box, underline,
-- circle, bracket). mark: 'contour' | 'underline' | 'circle' | 'bracket';
-- NULL = auto (one line circled, several bracketed). Run on PROD before
-- deploying this code (node apps/api/migrations/run.mjs).

BEGIN;

ALTER TABLE annotation
  ADD COLUMN IF NOT EXISTS mark text;

ALTER TABLE annotation
  ALTER COLUMN text DROP NOT NULL;

COMMIT;
