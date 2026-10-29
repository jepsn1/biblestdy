import {
  bigint,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
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
 * A note: standalone markdown document (issue #7). Anchored to passages via
 * noteAnchor (M:N, issue #8) — a note always has at least one anchor.
 */
export const note = pgTable('note', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  title: text('title').notNull().default(''),
  body: text('body').notNull().default(''),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

/** One passage a note is anchored to (word-span, see Anchor in shared). */
export const noteAnchor = pgTable('note_anchor', {
  id: uuid('id').primaryKey().defaultRandom(),
  noteId: uuid('note_id')
    .notNull()
    .references(() => note.id, { onDelete: 'cascade' }),
  translationId: text('translation_id').notNull(),
  book: text('book').notNull(),
  chapter: integer('chapter').notNull(),
  startVerse: integer('start_verse').notNull(),
  startWord: integer('start_word').notNull(),
  endVerse: integer('end_verse').notNull(),
  endWord: integer('end_word').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

/** A user's tag/topic (issue #10) — name is normalized lowercase, unique per user. */
export const tag = pgTable(
  'tag',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [unique('tag_user_name').on(t.userId, t.name)],
);

/** A tag on a note. */
export const noteTag = pgTable(
  'note_tag',
  {
    noteId: uuid('note_id')
      .notNull()
      .references(() => note.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tag.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.noteId, t.tagId] })],
);

/** A tag on a passage — chapter granularity, the connections panel's unit. */
export const passageTag = pgTable(
  'passage_tag',
  {
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tag.id, { onDelete: 'cascade' }),
    translationId: text('translation_id').notNull(),
    book: text('book').notNull(),
    chapter: integer('chapter').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tagId, t.translationId, t.book, t.chapter] }),
  ],
);

/**
 * Reading-quota state per subject (`user:<id>` / `ip:<address>`, #29). The
 * store locks the row (SELECT … FOR UPDATE) for each decision; null tokens =
 * fresh subject. Times are epoch ms.
 */
export const readingQuota = pgTable('reading_quota', {
  subject: text('subject').primaryKey(),
  tokens: integer('tokens'),
  refilledAt: bigint('refilled_at', { mode: 'number' }),
  /** Cooldowns (#32): strike count as of lastStrikeAt; decay is computed. */
  strikes: integer('strikes').notNull().default(0),
  lastStrikeAt: bigint('last_strike_at', { mode: 'number' }),
  /** Epoch ms the current cooldown ends; 0 = none. */
  cooldownUntil: bigint('cooldown_until', { mode: 'number' })
    .notNull()
    .default(0),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

/**
 * Daily cap (#30): distinct chapters a quota subject read per Copenhagen
 * calendar day. Written under the subject's reading_quota row lock; rows older
 * than 2 days are pruned.
 */
export const readingQuotaDay = pgTable(
  'reading_quota_day',
  {
    subject: text('subject').notNull(),
    day: date('day', { mode: 'string' }).notNull(),
    translationId: text('translation_id').notNull(),
    book: text('book').notNull(),
    chapter: integer('chapter').notNull(),
  },
  (t) => [
    primaryKey({
      columns: [t.subject, t.day, t.translationId, t.book, t.chapter],
    }),
    index('reading_quota_day_day_idx').on(t.day),
  ],
);
