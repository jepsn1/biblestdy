import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { Annotation, NewAnnotation } from '@biblestdy/shared';
import { db } from '../db';
import { annotation } from '../db/schema';

/** Persistence for inline annotations. All queries are scoped to a single user. */
@Injectable()
export class AnnotationsService {
  async listForChapter(
    userId: string,
    translationId: string,
    book: string,
    chapter: number,
  ): Promise<Annotation[]> {
    const rows = await db
      .select()
      .from(annotation)
      .where(
        and(
          eq(annotation.userId, userId),
          eq(annotation.translationId, translationId),
          eq(annotation.book, book),
          eq(annotation.chapter, chapter),
        ),
      );
    return rows.map(toAnnotation);
  }

  async create(userId: string, data: NewAnnotation): Promise<Annotation> {
    const [row] = await db
      .insert(annotation)
      .values({ userId, ...data })
      .returning();
    return toAnnotation(row);
  }

  /** Updates text and/or dragged position of a annotation the user owns; null if not found. */
  async update(
    userId: string,
    id: string,
    patch: {
      text?: string;
      offsetX?: number;
      offsetY?: number;
      width?: number;
    },
  ): Promise<Annotation | null> {
    const [row] = await db
      .update(annotation)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(annotation.id, id), eq(annotation.userId, userId)))
      .returning();
    return row ? toAnnotation(row) : null;
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const deleted = await db
      .delete(annotation)
      .where(and(eq(annotation.id, id), eq(annotation.userId, userId)))
      .returning({ id: annotation.id });
    return deleted.length > 0;
  }
}

function toAnnotation(row: typeof annotation.$inferSelect): Annotation {
  return {
    id: row.id,
    translationId: row.translationId,
    book: row.book,
    chapter: row.chapter,
    text: row.text,
    startVerse: row.startVerse,
    startWord: row.startWord,
    endVerse: row.endVerse,
    endWord: row.endWord,
    offsetX: row.offsetX,
    offsetY: row.offsetY,
    width: row.width,
  };
}
