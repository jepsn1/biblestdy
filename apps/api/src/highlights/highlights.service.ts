import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type {
  HighlightColor,
  Highlight,
  NewHighlight,
} from '@biblestdy/shared';
import { db } from '../db';
import { highlight } from '../db/schema';

/** Persistence for highlights. All queries are scoped to a single user. */
@Injectable()
export class HighlightsService {
  async listForChapter(
    userId: string,
    translationId: string,
    book: string,
    chapter: number,
  ): Promise<Highlight[]> {
    const rows = await db
      .select()
      .from(highlight)
      .where(
        and(
          eq(highlight.userId, userId),
          eq(highlight.translationId, translationId),
          eq(highlight.book, book),
          eq(highlight.chapter, chapter),
        ),
      );
    return rows.map(toHighlight);
  }

  async create(userId: string, data: NewHighlight): Promise<Highlight> {
    const [row] = await db
      .insert(highlight)
      .values({ userId, ...data })
      .returning();
    return toHighlight(row);
  }

  /** Returns true if a row was deleted (i.e. it existed and belonged to the user). */
  async remove(userId: string, id: string): Promise<boolean> {
    const deleted = await db
      .delete(highlight)
      .where(and(eq(highlight.id, id), eq(highlight.userId, userId)))
      .returning({ id: highlight.id });
    return deleted.length > 0;
  }
}

function toHighlight(row: typeof highlight.$inferSelect): Highlight {
  return {
    id: row.id,
    translationId: row.translationId,
    book: row.book,
    chapter: row.chapter,
    color: row.color as HighlightColor,
    startVerse: row.startVerse,
    startWord: row.startWord,
    endVerse: row.endVerse,
    endWord: row.endWord,
  };
}
