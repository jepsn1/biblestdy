-- #158 translation-agnostic note references (additive only).
-- note_ref = the references a note cites inline as [label](bible:JHN.3.16)
-- links, in canonical versification (no translation id). The API rebuilds a
-- note's origin='inline' rows from its body on every save. No backfill: the
-- rich editor could not store bible: links before this (Lexical blanked them
-- to about:blank), and any body that holds one anyway is indexed on its next
-- save. note_anchor rows are untouched — only an index is added.
-- Run on PROD BEFORE deploying this code (node apps/api/migrations/run.mjs):
-- the chapter queries join note_ref and would error on a missing table.

BEGIN;

CREATE TABLE IF NOT EXISTS note_ref (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id uuid NOT NULL REFERENCES note(id) ON DELETE CASCADE,
  book text NOT NULL,
  chapter integer NOT NULL,
  verse integer,
  end_chapter integer,
  end_verse integer,
  origin text NOT NULL DEFAULT 'inline',
  position integer,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS note_ref_book_chapter_idx ON note_ref (book, chapter);
CREATE INDEX IF NOT EXISTS note_ref_note_id_idx ON note_ref (note_id);

-- Chapter queries now look anchors up in every translation
CREATE INDEX IF NOT EXISTS note_anchor_book_chapter_idx ON note_anchor (book, chapter);

COMMIT;
