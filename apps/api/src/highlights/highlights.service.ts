import { Injectable } from '@nestjs/common';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
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
          isNull(highlight.deletedAt),
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

  /** Soft-deletes (#64); true if a live row of the user's was deleted. */
  async remove(userId: string, id: string): Promise<boolean> {
    const deleted = await db
      .update(highlight)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(highlight.id, id),
          eq(highlight.userId, userId),
          isNull(highlight.deletedAt),
        ),
      )
      .returning({ id: highlight.id });
    return deleted.length > 0;
  }

  /** Undo a delete (#64) — until the purge took it; null if not found. */
  async restore(userId: string, id: string): Promise<Highlight | null> {
    const [row] = await db
      .update(highlight)
      .set({ deletedAt: null })
      .where(
        and(
          eq(highlight.id, id),
          eq(highlight.userId, userId),
          isNotNull(highlight.deletedAt),
        ),
      )
      .returning();
    return row ? toHighlight(row) : null;
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
