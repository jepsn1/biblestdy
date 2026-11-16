import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
} from 'drizzle-orm';
import type { Anchor, ScriptureRef } from '@biblestdy/shared';
import { db } from '../db';
import { note, noteAnchor, noteRef } from '../db/schema';

/** A note row without its anchors. */
export interface NoteRow {
  id: string;
  userId: string;
  title: string;
  body: string;
  updatedAt: Date;
}

/** One anchor row of a note. */
export interface AnchorRow extends Anchor {
  id: string;
  noteId: string;
}

/** One note_ref row (#158) — nullable columns as stored. */
export interface RefRow {
  id: string;
  noteId: string;
  book: string;
  chapter: number;
  verse: number | null;
  endChapter: number | null;
  endVerse: number | null;
  origin: string;
  position: number | null;
}

/** Live notes only — soft-deleted ones (#64) are invisible to every read. */
const live = isNull(note.deletedAt);

/**
 * Persistence primitives for the note↔anchor graph. The M:N rules (first
 * anchor on create, dedupe) live in NotesService — tests
 * run it against an in-memory store, production against Drizzle/Postgres.
 */
export interface NoteStore {
  /** With `inlineRefs`: the note's inline note_ref rows, same transaction. */
  insertNote(
    userId: string,
    data: { title: string; body: string },
    inlineRefs?: ScriptureRef[],
  ): Promise<NoteRow>;
  getNote(userId: string, id: string): Promise<NoteRow | null>;
  /** With `inlineRefs`: REPLACES the note's origin='inline' rows (in text
   * order → position) in the same transaction as the body write. */
  updateNote(
    userId: string,
    id: string,
    patch: { title?: string; body?: string },
    inlineRefs?: ScriptureRef[],
  ): Promise<NoteRow | null>;
  /** Soft delete (#64): the note leaves every read below; anchors and tags
   * stay attached so restoreNote brings it back exactly. */
  deleteNote(userId: string, id: string): Promise<boolean>;
  /** Undo a deleteNote; null if no deleted note of the user's has the id. */
  restoreNote(userId: string, id: string): Promise<NoteRow | null>;
  /** Account deletion: ids of ALL the user's notes, soft-deleted included. */
  allNoteIds(userId: string): Promise<string[]>;
  /** Hard delete (account deletion) — the note and its anchors are gone. */
  purgeNote(userId: string, id: string): Promise<boolean>;
  /** All notes of the user, most recently updated first. */
  listNotes(userId: string): Promise<NoteRow[]>;
  /** Notes of the user with an anchor in the chapter in ANY translation, or
   * a ref touching it (cross-chapter ranges included) — #158. */
  notesInChapter(
    userId: string,
    book: string,
    chapter: number,
  ): Promise<NoteRow[]>;
  /** The notes' refs, each note's in position order. */
  refsFor(noteIds: string[]): Promise<RefRow[]>;
  insertAnchor(noteId: string, anchor: Anchor): Promise<AnchorRow>;
  deleteAnchor(noteId: string, anchorId: string): Promise<boolean>;
  anchorsFor(noteIds: string[]): Promise<AnchorRow[]>;
  /** The user's anchors in a chapter across ALL translations — the canonical
   * (book, chapter) reference correlates versions (#11). */
  anchorsInChapter(
    userId: string,
    book: string,
    chapter: number,
  ): Promise<AnchorRow[]>;
}

export class DrizzleNoteStore implements NoteStore {
  async insertNote(
    userId: string,
    data: { title: string; body: string },
    inlineRefs?: ScriptureRef[],
  ): Promise<NoteRow> {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .insert(note)
        .values({ userId, ...data })
        .returning();
      if (inlineRefs?.length) {
        await tx.insert(noteRef).values(inlineRefValues(row.id, inlineRefs));
      }
      return row;
    });
  }

  async getNote(userId: string, id: string): Promise<NoteRow | null> {
    const [row] = await db
      .select()
      .from(note)
      .where(and(eq(note.id, id), eq(note.userId, userId), live));
    return row ?? null;
  }

  async updateNote(
    userId: string,
    id: string,
    patch: { title?: string; body?: string },
    inlineRefs?: ScriptureRef[],
  ): Promise<NoteRow | null> {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .update(note)
        .set({ ...patch, updatedAt: new Date() })
        .where(and(eq(note.id, id), eq(note.userId, userId), live))
        .returning();
      if (!row) return null;
      if (inlineRefs) {
        await tx
          .delete(noteRef)
          .where(and(eq(noteRef.noteId, id), eq(noteRef.origin, 'inline')));
        if (inlineRefs.length > 0) {
          await tx.insert(noteRef).values(inlineRefValues(id, inlineRefs));
        }
      }
      return row;
    });
  }

  async deleteNote(userId: string, id: string): Promise<boolean> {
    const deleted = await db
      .update(note)
      .set({ deletedAt: new Date() })
      .where(and(eq(note.id, id), eq(note.userId, userId), live))
      .returning({ id: note.id });
    return deleted.length > 0;
  }

  async restoreNote(userId: string, id: string): Promise<NoteRow | null> {
    const [row] = await db
      .update(note)
      .set({ deletedAt: null })
      .where(
        and(
          eq(note.id, id),
          eq(note.userId, userId),
          isNotNull(note.deletedAt),
        ),
      )
      .returning();
    return row ?? null;
  }

  async allNoteIds(userId: string): Promise<string[]> {
    const rows = await db
      .select({ id: note.id })
      .from(note)
      .where(eq(note.userId, userId));
    return rows.map((r) => r.id);
  }

  async purgeNote(userId: string, id: string): Promise<boolean> {
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
      .where(and(eq(note.userId, userId), live))
      .orderBy(desc(note.updatedAt));
  }

  async notesInChapter(
    userId: string,
    book: string,
    chapter: number,
  ): Promise<NoteRow[]> {
    const anchoredHere = db
      .select({ id: noteAnchor.noteId })
      .from(noteAnchor)
      .where(and(eq(noteAnchor.book, book), eq(noteAnchor.chapter, chapter)));
    const citedHere = db
      .select({ id: noteRef.noteId })
      .from(noteRef)
      .where(
        and(
          eq(noteRef.book, book),
          lte(noteRef.chapter, chapter),
          gte(
            sql`coalesce(${noteRef.endChapter}, ${noteRef.chapter})`,
            chapter,
          ),
        ),
      );
    return db
      .select({
        id: note.id,
        userId: note.userId,
        title: note.title,
        body: note.body,
        updatedAt: note.updatedAt,
      })
      .from(note)
      .where(
        and(
          eq(note.userId, userId),
          live,
          or(inArray(note.id, anchoredHere), inArray(note.id, citedHere)),
        ),
      );
  }

  async refsFor(noteIds: string[]): Promise<RefRow[]> {
    if (noteIds.length === 0) return [];
    return db
      .select({
        id: noteRef.id,
        noteId: noteRef.noteId,
        book: noteRef.book,
        chapter: noteRef.chapter,
        verse: noteRef.verse,
        endChapter: noteRef.endChapter,
        endVerse: noteRef.endVerse,
        origin: noteRef.origin,
        position: noteRef.position,
      })
      .from(noteRef)
      .where(inArray(noteRef.noteId, noteIds))
      .orderBy(asc(noteRef.position), asc(noteRef.createdAt));
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

  async anchorsInChapter(
    userId: string,
    book: string,
    chapter: number,
  ): Promise<AnchorRow[]> {
    const rows = await db
      .select({
        id: noteAnchor.id,
        noteId: noteAnchor.noteId,
        translationId: noteAnchor.translationId,
        book: noteAnchor.book,
        chapter: noteAnchor.chapter,
        startVerse: noteAnchor.startVerse,
        startWord: noteAnchor.startWord,
        endVerse: noteAnchor.endVerse,
        endWord: noteAnchor.endWord,
      })
      .from(noteAnchor)
      .innerJoin(note, eq(note.id, noteAnchor.noteId))
      .where(
        and(
          eq(note.userId, userId),
          live,
          eq(noteAnchor.book, book),
          eq(noteAnchor.chapter, chapter),
        ),
      );
    return rows;
  }
}

/** note_ref insert values for a body's refs, in text order. */
function inlineRefValues(noteId: string, refs: ScriptureRef[]) {
  return refs.map((r, position) => ({
    noteId,
    book: r.book,
    chapter: r.chapter,
    verse: r.verse ?? null,
    endChapter: r.endChapter ?? null,
    endVerse: r.endVerse ?? null,
    origin: 'inline',
    position,
  }));
}
