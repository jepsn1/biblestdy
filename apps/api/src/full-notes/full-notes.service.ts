import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { FullNote, NewFullNote } from '@biblestdy/shared';
import { db } from '../db';
import { fullNote } from '../db/schema';

/** Persistence for full markdown notes. All queries scoped to one user. */
@Injectable()
export class FullNotesService {
  async listForChapter(
    userId: string,
    translationId: string,
    book: string,
    chapter: number,
  ): Promise<FullNote[]> {
    const rows = await db
      .select()
      .from(fullNote)
      .where(
        and(
          eq(fullNote.userId, userId),
          eq(fullNote.translationId, translationId),
          eq(fullNote.book, book),
          eq(fullNote.chapter, chapter),
        ),
      );
    return rows.map(toFullNote);
  }

  async create(userId: string, data: NewFullNote): Promise<FullNote> {
    const [row] = await db
      .insert(fullNote)
      .values({ userId, title: '', body: '', ...data })
      .returning();
    return toFullNote(row);
  }

  /** Updates title/body of a full note the user owns; null if not found. */
  async update(
    userId: string,
    id: string,
    patch: { title?: string; body?: string },
  ): Promise<FullNote | null> {
    const [row] = await db
      .update(fullNote)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(fullNote.id, id), eq(fullNote.userId, userId)))
      .returning();
    return row ? toFullNote(row) : null;
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const deleted = await db
      .delete(fullNote)
      .where(and(eq(fullNote.id, id), eq(fullNote.userId, userId)))
      .returning({ id: fullNote.id });
    return deleted.length > 0;
  }
}

function toFullNote(row: typeof fullNote.$inferSelect): FullNote {
  return {
    id: row.id,
    translationId: row.translationId,
    book: row.book,
    chapter: row.chapter,
    title: row.title,
    body: row.body,
    startVerse: row.startVerse,
    startWord: row.startWord,
    endVerse: row.endVerse,
    endWord: row.endWord,
  };
}
