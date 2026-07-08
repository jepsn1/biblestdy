import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth-schema';

/**
 * A highlight: a word-span anchor (see @biblestdy/shared Anchor) owned by one
 * user. Offsets are verse-relative word indices, stable per translation.
 */
export const highlight = pgTable('highlight', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  translationId: text('translation_id').notNull(),
  book: text('book').notNull(),
  chapter: integer('chapter').notNull(),
  startVerse: integer('start_verse').notNull(),
  startWord: integer('start_word').notNull(),
  endVerse: integer('end_verse').notNull(),
  endWord: integer('end_word').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
