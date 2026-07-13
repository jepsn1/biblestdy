import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import { noteTag, passageTag, tag } from '../db/schema';

/** A tag row. */
export interface TagRow {
  id: string;
  userId: string;
  name: string;
}

/** A tagged passage — chapter granularity. */
export interface PassageRef {
  translationId: string;
  book: string;
  chapter: number;
}

/**
 * Persistence primitives for tags/topics (issue #10). Rules (name
 * normalization, ownership, orphan cleanup, topic assembly) live in
 * TagsService — behavior-tested against the in-memory store.
 */
export interface TagStore {
  listTags(userId: string): Promise<TagRow[]>;
  getTagByName(userId: string, name: string): Promise<TagRow | null>;
  insertTag(userId: string, name: string): Promise<TagRow>;
  deleteTag(tagId: string): Promise<void>;
  /** True if any note or passage still carries the tag. */
  isTagUsed(tagId: string): Promise<boolean>;

  tagNote(noteId: string, tagId: string): Promise<void>;
  untagNote(noteId: string, tagId: string): Promise<boolean>;
  /** Tags of the given notes, as (noteId, tag) pairs. */
  tagsForNotes(noteIds: string[]): Promise<(TagRow & { noteId: string })[]>;
  noteIdsWithTag(tagId: string): Promise<string[]>;

  tagPassage(tagId: string, passage: PassageRef): Promise<void>;
  untagPassage(tagId: string, passage: PassageRef): Promise<boolean>;
  tagsForPassage(userId: string, passage: PassageRef): Promise<TagRow[]>;
  passagesWithTag(tagId: string): Promise<PassageRef[]>;
}

export class DrizzleTagStore implements TagStore {
  async listTags(userId: string): Promise<TagRow[]> {
    return db
      .select()
      .from(tag)
      .where(eq(tag.userId, userId))
      .orderBy(asc(tag.name));
  }

  async getTagByName(userId: string, name: string): Promise<TagRow | null> {
    const [row] = await db
      .select()
      .from(tag)
      .where(and(eq(tag.userId, userId), eq(tag.name, name)));
    return row ?? null;
  }

  async insertTag(userId: string, name: string): Promise<TagRow> {
    const [row] = await db.insert(tag).values({ userId, name }).returning();
    return row;
  }

  async deleteTag(tagId: string): Promise<void> {
    await db.delete(tag).where(eq(tag.id, tagId));
  }

  async isTagUsed(tagId: string): Promise<boolean> {
    const [n] = await db
      .select({ tagId: noteTag.tagId })
      .from(noteTag)
      .where(eq(noteTag.tagId, tagId))
      .limit(1);
    if (n) return true;
    const [p] = await db
      .select({ tagId: passageTag.tagId })
      .from(passageTag)
      .where(eq(passageTag.tagId, tagId))
      .limit(1);
    return Boolean(p);
  }

  async tagNote(noteId: string, tagId: string): Promise<void> {
    await db.insert(noteTag).values({ noteId, tagId }).onConflictDoNothing();
  }

  async untagNote(noteId: string, tagId: string): Promise<boolean> {
    const deleted = await db
      .delete(noteTag)
      .where(and(eq(noteTag.noteId, noteId), eq(noteTag.tagId, tagId)))
      .returning({ tagId: noteTag.tagId });
    return deleted.length > 0;
  }

  async tagsForNotes(
    noteIds: string[],
  ): Promise<(TagRow & { noteId: string })[]> {
    if (noteIds.length === 0) return [];
    const rows = await db
      .select({
        id: tag.id,
        userId: tag.userId,
        name: tag.name,
        noteId: noteTag.noteId,
      })
      .from(noteTag)
      .innerJoin(tag, eq(tag.id, noteTag.tagId))
      .where(inArray(noteTag.noteId, noteIds))
      .orderBy(asc(tag.name));
    return rows;
  }

  async noteIdsWithTag(tagId: string): Promise<string[]> {
    const rows = await db
      .select({ noteId: noteTag.noteId })
      .from(noteTag)
      .where(eq(noteTag.tagId, tagId));
    return rows.map((r) => r.noteId);
  }

  async tagPassage(tagId: string, passage: PassageRef): Promise<void> {
    await db
      .insert(passageTag)
      .values({ tagId, ...passage })
      .onConflictDoNothing();
  }

  async untagPassage(tagId: string, passage: PassageRef): Promise<boolean> {
    const deleted = await db
      .delete(passageTag)
      .where(
        and(
          eq(passageTag.tagId, tagId),
          eq(passageTag.translationId, passage.translationId),
          eq(passageTag.book, passage.book),
          eq(passageTag.chapter, passage.chapter),
        ),
      )
      .returning({ tagId: passageTag.tagId });
    return deleted.length > 0;
  }

  async tagsForPassage(userId: string, passage: PassageRef): Promise<TagRow[]> {
    return db
      .select({ id: tag.id, userId: tag.userId, name: tag.name })
      .from(passageTag)
      .innerJoin(tag, eq(tag.id, passageTag.tagId))
      .where(
        and(
          eq(tag.userId, userId),
          eq(passageTag.translationId, passage.translationId),
          eq(passageTag.book, passage.book),
          eq(passageTag.chapter, passage.chapter),
        ),
      )
      .orderBy(asc(tag.name));
  }

  async passagesWithTag(tagId: string): Promise<PassageRef[]> {
    return db
      .select({
        translationId: passageTag.translationId,
        book: passageTag.book,
        chapter: passageTag.chapter,
      })
      .from(passageTag)
      .where(eq(passageTag.tagId, tagId));
  }
}
