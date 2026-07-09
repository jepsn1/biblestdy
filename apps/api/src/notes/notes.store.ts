import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Anchor } from '@biblestdy/shared';
import { db } from '../db';
import { note, noteAnchor } from '../db/schema';

/** A note row without its anchors. */
export interface NoteRow {
  id: string;
  userId: string;
  title: string;
  body: string;
}

/** One anchor row of a note. */
export interface AnchorRow extends Anchor {
  id: string;
  noteId: string;
}

/**
 * Persistence primitives for the note↔anchor graph. The M:N rules (first
 * anchor on create, dedupe, last-anchor guard) live in NotesService — tests
 * run it against an in-memory store, production against Drizzle/Postgres.
 */
export interface NoteStore {
  insertNote(
    userId: string,
    data: { title: string; body: string },
  ): Promise<NoteRow>;
  getNote(userId: string, id: string): Promise<NoteRow | null>;
  updateNote(
    userId: string,
    id: string,
    patch: { title?: string; body?: string },
  ): Promise<NoteRow | null>;
  deleteNote(userId: string, id: string): Promise<boolean>;
  /** All notes of the user, most recently updated first. */
  listNotes(userId: string): Promise<NoteRow[]>;
  /** Notes of the user having at least one anchor in the chapter. */
  notesWithAnchorIn(
    userId: string,
    translationId: string,
    book: string,
    chapter: number,
  ): Promise<NoteRow[]>;
  insertAnchor(noteId: string, anchor: Anchor): Promise<AnchorRow>;
  deleteAnchor(noteId: string, anchorId: string): Promise<boolean>;
  anchorsFor(noteIds: string[]): Promise<AnchorRow[]>;
}

export class DrizzleNoteStore implements NoteStore {
  async insertNote(
    userId: string,
    data: { title: string; body: string },
  ): Promise<NoteRow> {
    const [row] = await db
      .insert(note)
      .values({ userId, ...data })
      .returning();
    return row;
  }

  async getNote(userId: string, id: string): Promise<NoteRow | null> {
    const [row] = await db
      .select()
      .from(note)
      .where(and(eq(note.id, id), eq(note.userId, userId)));
    return row ?? null;
  }

  async updateNote(
    userId: string,
    id: string,
    patch: { title?: string; body?: string },
  ): Promise<NoteRow | null> {
    const [row] = await db
      .update(note)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(note.id, id), eq(note.userId, userId)))
      .returning();
    return row ?? null;
  }

  async deleteNote(userId: string, id: string): Promise<boolean> {
    const deleted = await db
      .delete(note)
      .where(and(eq(note.id, id), eq(note.userId, userId)))
      .returning({ id: note.id });
    return deleted.length > 0;
  }

  async listNotes(userId: string): Promise<NoteRow[]> {
    return db
      .select()
      .from(note)
      .where(eq(note.userId, userId))
      .orderBy(desc(note.updatedAt));
  }

  async notesWithAnchorIn(
    userId: string,
    translationId: string,
    book: string,
    chapter: number,
  ): Promise<NoteRow[]> {
    const rows = await db
      .selectDistinct({
        id: note.id,
        userId: note.userId,
        title: note.title,
        body: note.body,
      })
      .from(note)
      .innerJoin(noteAnchor, eq(noteAnchor.noteId, note.id))
      .where(
        and(
          eq(note.userId, userId),
          eq(noteAnchor.translationId, translationId),
          eq(noteAnchor.book, book),
          eq(noteAnchor.chapter, chapter),
        ),
      );
    return rows;
  }

  async insertAnchor(noteId: string, anchor: Anchor): Promise<AnchorRow> {
    const [row] = await db
      .insert(noteAnchor)
      .values({ noteId, ...anchor })
      .returning();
    return row;
  }

  async deleteAnchor(noteId: string, anchorId: string): Promise<boolean> {
    const deleted = await db
      .delete(noteAnchor)
      .where(and(eq(noteAnchor.id, anchorId), eq(noteAnchor.noteId, noteId)))
      .returning({ id: noteAnchor.id });
    return deleted.length > 0;
  }

  async anchorsFor(noteIds: string[]): Promise<AnchorRow[]> {
    if (noteIds.length === 0) return [];
    return db
      .select()
      .from(noteAnchor)
      .where(inArray(noteAnchor.noteId, noteIds))
      .orderBy(noteAnchor.createdAt);
  }
}
