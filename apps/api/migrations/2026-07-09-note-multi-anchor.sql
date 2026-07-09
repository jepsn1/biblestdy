-- #8 multi-anchor: note anchors move to a join table (M:N note<->passage).
-- Dev applied 2026-07-09. Run on PROD before deploying this schema
-- (psql "$DATABASE_URL" -f apps/api/migrations/2026-07-09-note-multi-anchor.sql),
-- then `pnpm db:push` there is a no-op.

BEGIN;

CREATE TABLE IF NOT EXISTS note_anchor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id uuid NOT NULL REFERENCES note(id) ON DELETE CASCADE,
  translation_id text NOT NULL,
  book text NOT NULL,
  chapter integer NOT NULL,
  start_verse integer NOT NULL,
  start_word integer NOT NULL,
  end_verse integer NOT NULL,
  end_word integer NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

-- Each existing note's single anchor becomes its first note_anchor row.
INSERT INTO note_anchor (note_id, translation_id, book, chapter, start_verse, start_word, end_verse, end_word, created_at)
SELECT id, translation_id, book, chapter, start_verse, start_word, end_verse, end_word, created_at
FROM note;

ALTER TABLE note
  DROP COLUMN translation_id,
  DROP COLUMN book,
  DROP COLUMN chapter,
  DROP COLUMN start_verse,
  DROP COLUMN start_word,
  DROP COLUMN end_verse,
  DROP COLUMN end_word;

COMMIT;
