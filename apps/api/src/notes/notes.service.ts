import { Injectable } from '@nestjs/common';
import {
  payloadAnchor,
  sameAnchor,
  type Anchor,
  type NewNote,
  type Note,
  type Tag,
} from '@biblestdy/shared';
import type { TagStore } from '../tags/tags.store';
import type { AnchorRow, NoteRow, NoteStore } from './notes.store';

/**
 * The note↔anchor graph (issue #8): a note is a markdown document referencing
 * passages, M:N via anchors. Since the notes rework a note may have none yet
 * (a draft written on the Notes page). Rules live here, persistence in the
 * NoteStore — behavior-tested against the in-memory store.
 */
@Injectable()
export class NotesService {
  constructor(
    private readonly store: NoteStore,
    /** Topics for the all-notes list; absent in tests that don't need them. */
    private readonly tags?: TagStore,
  ) {}

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

  /** All the user's notes (Notes page, attach-picker), most recently updated
   * first — each with its anchors and topics. */
  async listAll(userId: string): Promise<Note[]> {
    const rows = await this.store.listNotes(userId);
    const notes = await this.withAnchors(rows);
    if (!this.tags) return notes;
    const tags = await this.tags.tagsForNotes(rows.map((r) => r.id));
    return notes.map((n) => ({
      ...n,
      tags: tags
        .filter((t) => t.noteId === n.id)
        .map((t): Tag => ({ id: t.id, name: t.name })),
    }));
  }

  /** Creates a note — on its first anchor when made from a selection, with
   * no passage yet when written on the Notes page. */
  async create(userId: string, data: NewNote): Promise<Note> {
    const { title = '', body = '', ...rest } = data;
    const anchor = payloadAnchor(rest);
    if (anchor === 'partial') throw new Error('partial anchor'); // the controller refuses these
    const row = await this.store.insertNote(userId, { title, body });
    if (!anchor) return toNote(row, []);
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

  /** Soft delete (#64) — restore() undoes it until the purge runs. */
  async remove(userId: string, id: string): Promise<boolean> {
    return this.store.deleteNote(userId, id);
  }

  /** Undo a delete: the note returns with all its anchors (and tags). */
  async restore(userId: string, id: string): Promise<Note | null> {
    const row = await this.store.restoreNote(userId, id);
    if (!row) return null;
    const [note] = await this.withAnchors([row]);
    return note;
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
    if (anchors.some((a) => sameAnchor(a, anchor))) return toNote(row, anchors);
    anchors.push(await this.store.insertAnchor(id, anchor));
    // A new reference is an edit: the note rises in the Notes list
    return toNote(
      (await this.store.updateNote(userId, id, {})) ?? row,
      anchors,
    );
  }

  /** Removes one anchor. The last one may go too: the note stays on the Notes
   * page, without passages, until linked again. */
  async removeAnchor(
    userId: string,
    id: string,
    anchorId: string,
  ): Promise<Note | null> {
    const row = await this.store.getNote(userId, id);
    if (!row) return null;
    const anchors = await this.store.anchorsFor([id]);
    if (!anchors.some((a) => a.id === anchorId)) return null;
    await this.store.deleteAnchor(id, anchorId);
    return toNote(
      (await this.store.updateNote(userId, id, {})) ?? row,
      anchors.filter((a) => a.id !== anchorId),
    );
  }

  /** Per-verse count of notes anchored to this chapter in OTHER translations
   * (#11): the canonical (book, chapter, verse) reference correlates versions.
   * A note counts once per verse its span covers; one note anchored twice on
   * a verse still counts once. */
  async otherVersionNoteCounts(
    userId: string,
    translationId: string,
    book: string,
    chapter: number,
  ): Promise<{ verse: number; count: number }[]> {
    const anchors = await this.store.anchorsInChapter(userId, book, chapter);
    const notesPerVerse = new Map<number, Set<string>>();
    for (const a of anchors) {
      if (a.translationId === translationId) continue;
      for (let verse = a.startVerse; verse <= a.endVerse; verse++) {
        const set = notesPerVerse.get(verse) ?? new Set<string>();
        set.add(a.noteId);
        notesPerVerse.set(verse, set);
      }
    }
    return [...notesPerVerse.entries()]
      .map(([verse, ids]) => ({ verse, count: ids.size }))
      .sort((a, b) => a.verse - b.verse);
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
    updatedAt: row.updatedAt.toISOString(),
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
