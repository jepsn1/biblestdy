import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  smallint,
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
  /** The marked words, plain text (palette search); null until backfilled. */
  quote: text('quote'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  /** Soft delete (#64): set on DELETE, cleared by restore (undo); purged after an hour. */
  deletedAt: timestamp('deleted_at'),
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
  // Null = a plain pen mark (no margin text)
  text: text('text'),
  startVerse: integer('start_verse').notNull(),
  startWord: integer('start_word').notNull(),
  endVerse: integer('end_verse').notNull(),
  endWord: integer('end_word').notNull(),
  // Dragged box position, offset from the anchored words' center; null = auto
  offsetX: real('offset_x'),
  offsetY: real('offset_y'),
  // User-resized box width (px); null = default lane width
  width: real('width'),
  // Pen style: 'contour' | 'underline' | 'circle' | 'bracket'; null = auto by line count
  mark: text('mark'),
  /** The marked words, plain text (palette search); null until backfilled. */
  quote: text('quote'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  /** Soft delete (#64), see highlight.deletedAt. */
  deletedAt: timestamp('deleted_at'),
});

/**
 * A note: standalone markdown document (issue #7). Anchored to passages via
 * noteAnchor (M:N, issue #8; zero or more since the notes plan) and cites
 * passages inline (noteRef, #158).
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
  /** Soft delete (#64): anchors + tags stay attached so restore is exact. */
  deletedAt: timestamp('deleted_at'),
});

/** One passage a note is anchored to (word-span, see Anchor in shared). */
export const noteAnchor = pgTable(
  'note_anchor',
  {
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
  },
  // Chapter queries look anchors up by (book, chapter) in any translation
  (t) => [index('note_anchor_book_chapter_idx').on(t.book, t.chapter)],
);

/**
 * A translation-agnostic reference of a note (#158): canonical (English)
 * versification, no translation id. `origin='inline'` rows are derived from
 * the body's `[…](bible:…)` links and rebuilt on every body save.
 * verse null = the whole chapter; end_* null = a single verse; end_chapter
 * set only when a range leaves its first chapter.
 */
export const noteRef = pgTable(
  'note_ref',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    noteId: uuid('note_id')
      .notNull()
      .references(() => note.id, { onDelete: 'cascade' }),
    book: text('book').notNull(),
    chapter: integer('chapter').notNull(),
    verse: integer('verse'),
    endChapter: integer('end_chapter'),
    endVerse: integer('end_verse'),
    origin: text('origin').notNull().default('inline'),
    position: integer('position'),
    /** The reader's mark the ref was tagged with (#216): 'highlight' |
     * 'annotation' + its id, from the link's title. No FK — an erased
     * mark leaves the ref (the reader falls back to the verse). */
    markKind: text('mark_kind'),
    markId: uuid('mark_id'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('note_ref_book_chapter_idx').on(t.book, t.chapter),
    index('note_ref_note_id_idx').on(t.noteId),
  ],
);

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

/** Per-account preferences (#45). null readerStyle = not chosen yet;
 * null textSize (#61) = never changed (100%). */
export const userPreference = pgTable('user_preference', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  readerStyle: text('reader_style'),
  textSize: smallint('text_size'),
  /** Renamed highlight colours only ({blue: "God speaking"}); {} = defaults. */
  highlightLabels: jsonb('highlight_labels')
    .$type<Record<string, string>>()
    .notNull()
    .default({}),
  /** Single-character shortcuts on (#145, WCAG 2.1.4); false = turned off. */
  singleKeyShortcuts: boolean('single_key_shortcuts').notNull().default(true),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

/**
 * Persistent Scripture cache (#248), shared by every API process on this
 * database: memory → here → provider. Key "<source>:chapter:<id>/<BOOK>.<n>"
 * or "<source>:translations"; payload without the FUMS token (own column).
 * Never served older than MAX_AGE_MS (caching.provider.ts, ToS §11).
 */
export const scriptureCache = pgTable(
  'scripture_cache',
  {
    key: text('key').primaryKey(),
    source: text('source').notNull(),
    kind: text('kind').$type<'chapter' | 'translations'>().notNull(),
    translationId: text('translation_id'),
    payload: jsonb('payload').$type<unknown>().notNull(),
    fumsToken: text('fums_token'),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('scripture_cache_translation_idx').on(t.source, t.translationId),
  ],
);

/** Provider (API.Bible) calls per UTC day and source (#248 soft budget). */
export const scriptureUpstreamCall = pgTable(
  'scripture_upstream_call',
  {
    day: date('day', { mode: 'string' }).notNull(),
    source: text('source').notNull(),
    calls: integer('calls').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.day, t.source] })],
);
