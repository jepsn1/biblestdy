import {
  integer,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
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
  color: text('color').notNull().default('gold'),
  startVerse: integer('start_verse').notNull(),
  startWord: integer('start_word').notNull(),
  endVerse: integer('end_verse').notNull(),
  endWord: integer('end_word').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

/** A short inline annotation (handwritten scribble) on a word-span, owned by one user. */
export const annotation = pgTable('annotation', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  translationId: text('translation_id').notNull(),
  book: text('book').notNull(),
  chapter: integer('chapter').notNull(),
  text: text('text').notNull(),
  startVerse: integer('start_verse').notNull(),
  startWord: integer('start_word').notNull(),
  endVerse: integer('end_verse').notNull(),
  endWord: integer('end_word').notNull(),
  // Dragged box position, offset from the anchored words' center; null = auto
  offsetX: real('offset_x'),
  offsetY: real('offset_y'),
  // User-resized box width (px); null = default lane width
  width: real('width'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

/**
 * A note: standalone markdown document anchored to a span (issue #7).
 * Single anchor for now — #8 (multi-anchor) will move anchors to a join table.
 */
export const note = pgTable('note', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  translationId: text('translation_id').notNull(),
  book: text('book').notNull(),
  chapter: integer('chapter').notNull(),
  title: text('title').notNull().default(''),
  body: text('body').notNull().default(''),
  startVerse: integer('start_verse').notNull(),
  startWord: integer('start_word').notNull(),
  endVerse: integer('end_verse').notNull(),
  endWord: integer('end_word').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
