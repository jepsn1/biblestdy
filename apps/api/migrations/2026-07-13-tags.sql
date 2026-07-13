-- #10 tags + topic pages: tag / note_tag / passage_tag (additive only).
-- Dev applied 2026-07-13 via db:push. Run on PROD before deploying this
-- schema (psql "$DATABASE_URL" -f apps/api/migrations/2026-07-13-tags.sql),
-- then `pnpm db:push` there is a no-op.

BEGIN;

CREATE TABLE IF NOT EXISTS tag (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT tag_user_name UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS note_tag (
  note_id uuid NOT NULL REFERENCES note(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
  PRIMARY KEY (note_id, tag_id)
);

CREATE TABLE IF NOT EXISTS passage_tag (
  tag_id uuid NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
  translation_id text NOT NULL,
  book text NOT NULL,
  chapter integer NOT NULL,
  PRIMARY KEY (tag_id, translation_id, book, chapter)
);

COMMIT;
