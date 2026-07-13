import { Injectable } from '@nestjs/common';
import {
  sameAnchor,
  type Anchor,
  type Note,
  type NewNote,
} from '@biblestdy/shared';
import type { AnchorRow, NoteRow, NoteStore } from './notes.store';

/**
 * The note↔anchor graph (issue #8): a note is a markdown document anchored to
 * one or more passages, M:N via anchors. Rules live here, persistence in the
 * NoteStore — behavior-tested against the in-memory store.
 */
@Injectable()
export class NotesService {
  constructor(private readonly store: NoteStore) {}

  /** Notes with at least one anchor in the chapter — each with ALL its anchors. */
  async listForChapter(
    userId: string,
    translationId: string,
    book: string,
    chapter: number,
  ): Promise<Note[]> {
    const rows = await this.store.notesWithAnchorIn(
      userId,
      translationId,
      book,
      chapter,
    );
    return this.withAnchors(rows);
  }

  /** All the user's notes (for the attach-picker), most recently updated first. */
  async listAll(userId: string): Promise<Note[]> {
    return this.withAnchors(await this.store.listNotes(userId));
  }

  /** Creates a note on its first anchor. */
  async create(userId: string, data: NewNote): Promise<Note> {
    const { title = '', body = '', ...anchor } = data;
    const row = await this.store.insertNote(userId, { title, body });
    const a = await this.store.insertAnchor(row.id, anchor);
    return toNote(row, [a]);
  }

  /** Updates title/body of a note the user owns; null if not found. */
  async update(
    userId: string,
    id: string,
    patch: { title?: string; body?: string },
  ): Promise<Note | null> {
    const row = await this.store.updateNote(userId, id, patch);
    if (!row) return null;
    const [note] = await this.withAnchors([row]);
    return note;
  }

  async remove(userId: string, id: string): Promise<boolean> {
    return this.store.deleteNote(userId, id);
  }

  /** Anchors an existing note to another passage. Anchoring the exact same
   * span twice is a no-op. Null if the note isn't the user's. */
  async addAnchor(
    userId: string,
    id: string,
    anchor: Anchor,
  ): Promise<Note | null> {
    const row = await this.store.getNote(userId, id);
    if (!row) return null;
    const anchors = await this.store.anchorsFor([id]);
    if (!anchors.some((a) => sameAnchor(a, anchor))) {
      anchors.push(await this.store.insertAnchor(id, anchor));
    }
    return toNote(row, anchors);
  }

  /** Removes one anchor. A note is always reachable from Scripture, so the
   * last anchor can't be removed — delete the note instead. */
  async removeAnchor(
    userId: string,
    id: string,
    anchorId: string,
  ): Promise<Note | 'not-found' | 'last-anchor'> {
    const row = await this.store.getNote(userId, id);
    if (!row) return 'not-found';
    const anchors = await this.store.anchorsFor([id]);
    if (!anchors.some((a) => a.id === anchorId)) return 'not-found';
    if (anchors.length <= 1) return 'last-anchor';
    await this.store.deleteAnchor(id, anchorId);
    return toNote(
      row,
      anchors.filter((a) => a.id !== anchorId),
    );
  }

  private async withAnchors(rows: NoteRow[]): Promise<Note[]> {
    const anchors = await this.store.anchorsFor(rows.map((r) => r.id));
    return rows.map((row) =>
      toNote(
        row,
        anchors.filter((a) => a.noteId === row.id),
      ),
    );
  }
}

/** Assembles the wire Note from its rows (also used by ConnectionsService). */
export function toNote(row: NoteRow, anchors: AnchorRow[]): Note {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    anchors: anchors.map((a) => ({
      id: a.id,
      translationId: a.translationId,
      book: a.book,
      chapter: a.chapter,
      startVerse: a.startVerse,
      startWord: a.startWord,
      endVerse: a.endVerse,
      endWord: a.endWord,
    })),
  };
}
