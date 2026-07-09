import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { Note, NewNote } from '@biblestdy/shared';
import { db } from '../db';
import { note } from '../db/schema';

/** Persistence for full markdown notes. All queries scoped to one user. */
@Injectable()
export class NotesService {
  async listForChapter(
    userId: string,
    translationId: string,
    book: string,
    chapter: number,
  ): Promise<Note[]> {
    const rows = await db
      .select()
      .from(note)
      .where(
        and(
          eq(note.userId, userId),
          eq(note.translationId, translationId),
          eq(note.book, book),
          eq(note.chapter, chapter),
        ),
      );
    return rows.map(toNote);
  }

  async create(userId: string, data: NewNote): Promise<Note> {
    const [row] = await db
      .insert(note)
      .values({ userId, title: '', body: '', ...data })
      .returning();
    return toNote(row);
  }

  /** Updates title/body of a full note the user owns; null if not found. */
  async update(
    userId: string,
    id: string,
    patch: { title?: string; body?: string },
  ): Promise<Note | null> {
    const [row] = await db
      .update(note)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(note.id, id), eq(note.userId, userId)))
      .returning();
    return row ? toNote(row) : null;
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const deleted = await db
      .delete(note)
      .where(and(eq(note.id, id), eq(note.userId, userId)))
      .returning({ id: note.id });
    return deleted.length > 0;
  }
}

function toNote(row: typeof note.$inferSelect): Note {
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
