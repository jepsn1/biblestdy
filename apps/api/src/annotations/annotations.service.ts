import { Injectable } from '@nestjs/common';
import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import type { Annotation, AnnotationMark, NewAnnotation } from '@biblestdy/shared';
import { db } from '../db';
import { annotation } from '../db/schema';

const MARKS = new Set<AnnotationMark>(['contour', 'underline', 'circle', 'bracket']);

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
          isNull(annotation.deletedAt),
        ),
      );
    return rows.map(toAnnotation);
  }

  /** Every live annotation of the user's, most recently edited first. */
  async listAll(userId: string): Promise<Annotation[]> {
    const rows = await db
      .select()
      .from(annotation)
      .where(and(eq(annotation.userId, userId), isNull(annotation.deletedAt)))
      .orderBy(desc(annotation.updatedAt));
    return rows.map(toAnnotation);
  }

  async create(userId: string, data: NewAnnotation): Promise<Annotation> {
    const [row] = await db
      .insert(annotation)
      .values({ userId, ...data })
      .returning();
    return toAnnotation(row);
  }

  /** Updates text, quote and/or dragged position of a annotation the user owns; null if not found. */
  async update(
    userId: string,
    id: string,
    patch: {
      text?: string | null;
      quote?: string;
      offsetX?: number;
      offsetY?: number;
      width?: number;
      mark?: AnnotationMark | null;
    },
  ): Promise<Annotation | null> {
    // Storing the quote (backfill) isn't an edit: keep "recently edited" order
    const { quote: _quote, ...edit } = patch;
    const edited = Object.values(edit).some((v) => v !== undefined);
    const [row] = await db
      .update(annotation)
      .set(edited ? { ...patch, updatedAt: new Date() } : patch)
      .where(
        and(
          eq(annotation.id, id),
          eq(annotation.userId, userId),
          isNull(annotation.deletedAt),
        ),
      )
      .returning();
    return row ? toAnnotation(row) : null;
  }

  /** Soft-deletes (#64); true if a live row of the user's was deleted. */
  async remove(userId: string, id: string): Promise<boolean> {
    const deleted = await db
      .update(annotation)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(annotation.id, id),
          eq(annotation.userId, userId),
          isNull(annotation.deletedAt),
        ),
      )
      .returning({ id: annotation.id });
    return deleted.length > 0;
  }

  /** Undo a delete (#64) — until the purge took it; null if not found. */
  async restore(userId: string, id: string): Promise<Annotation | null> {
    const [row] = await db
      .update(annotation)
      .set({ deletedAt: null })
      .where(
        and(
          eq(annotation.id, id),
          eq(annotation.userId, userId),
          isNotNull(annotation.deletedAt),
        ),
      )
      .returning();
    return row ? toAnnotation(row) : null;
  }
}

function toAnnotation(row: typeof annotation.$inferSelect): Annotation {
  return {
    id: row.id,
    translationId: row.translationId,
    book: row.book,
    chapter: row.chapter,
    text: row.text,
    quote: row.quote,
    startVerse: row.startVerse,
    startWord: row.startWord,
    endVerse: row.endVerse,
    endWord: row.endWord,
    offsetX: row.offsetX,
    offsetY: row.offsetY,
    width: row.width,
    mark: MARKS.has(row.mark as AnnotationMark) ? (row.mark as AnnotationMark) : null,
  };
}
