import { Injectable } from '@nestjs/common';
import {
  payloadAnchor,
  refsInMarkdown,
  sameAnchor,
  type Anchor,
  type Deleted,
  type NewNote,
  type Note,
  type NoteRef,
  type NoteRefOrigin,
  type ScriptureRef,
  type Tag,
} from '@biblestdy/shared';
import type { TagStore } from '../tags/tags.store';
import type { AnchorRow, NoteRow, NoteStore, RefRow } from './notes.store';
import { idIsAbbr, notesTouchingChapter, type AbbrOf } from './chapter-scope';

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
    /** Translation id → abbreviation, for the versification map (#163). */
    private readonly abbrOf: AbbrOf = idIsAbbr,
  ) {}

  /** Notes touching a chapter of the reading translation — an anchor there
   * in ANY translation, or a ref (inline `bible:` link) covering it,
   * cross-chapter ranges included (#158) — each with ALL its anchors and
   * refs. Numbering is mapped (#163): BPH Mal 3 lists a ref to Mal 4:5.
   * Clients tell home-translation anchors apart themselves. */
  async listForChapter(
    userId: string,
    translationId: string,
    book: string,
    chapter: number,
  ): Promise<Note[]> {
    const { rows, anchors, refs } = await notesTouchingChapter(
      this.store,
      this.abbrOf,
      userId,
      translationId,
      book,
      chapter,
    );
    return rows.map((row) =>
      toNote(
        row,
        anchors.filter((a) => a.noteId === row.id),
        refs.filter((r) => r.noteId === row.id),
      ),
    );
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
    const row = await this.store.insertNote(
      userId,
      { title, body },
      refsInMarkdown(body),
    );
    const refs = await this.store.refsFor([row.id]);
    if (!anchor) return toNote(row, [], refs);
    const a = await this.store.insertAnchor(row.id, anchor);
    return toNote(row, [a], refs);
  }

  /** Updates title/body of a note the user owns; null if not found. A new
   * body rebuilds the note's inline refs from its `bible:` links in the same
   * write — the body is the one source of truth (#158). */
  async update(
    userId: string,
    id: string,
    patch: { title?: string; body?: string },
  ): Promise<Note | null> {
    const inline =
      patch.body === undefined ? undefined : refsInMarkdown(patch.body);
    const row = await this.store.updateNote(userId, id, patch, inline);
    if (!row) return null;
    const [note] = await this.withAnchors([row]);
    return note;
  }

  /** Soft delete (#64) — restore() undoes it until the purge runs
   * (TRASH_DAYS, #261). */
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

  /** Recently deleted (#261): the user's deleted notes still restorable,
   * newest deletion first, each with its anchors. Blank ones (no title, no
   * text — an abandoned "New note") aren't listed: nothing to bring back. */
  async listDeleted(userId: string): Promise<Deleted<Note>[]> {
    const rows = (await this.store.listDeletedNotes(userId)).filter(
      (r) => r.title.trim() !== '' || r.body.trim() !== '',
    );
    const notes = await this.withAnchors(rows);
    return notes.map((n, i) => ({
      ...n,
      deletedAt: rows[i].deletedAt.toISOString(),
    }));
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
    const refs = await this.store.refsFor([id]);
    if (anchors.some((a) => sameAnchor(a, anchor)))
      return toNote(row, anchors, refs);
    anchors.push(await this.store.insertAnchor(id, anchor));
    // A new reference is an edit: the note rises in the Notes list
    return toNote(
      (await this.store.updateNote(userId, id, {})) ?? row,
      anchors,
      refs,
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
      await this.store.refsFor([id]),
    );
  }

  private async withAnchors(rows: NoteRow[]): Promise<Note[]> {
    const ids = rows.map((r) => r.id);
    const anchors = await this.store.anchorsFor(ids);
    const refs = await this.store.refsFor(ids);
    return rows.map((row) =>
      toNote(
        row,
        anchors.filter((a) => a.noteId === row.id),
        refs.filter((r) => r.noteId === row.id),
      ),
    );
  }
}

/** A stored ref as a ScriptureRef (null columns dropped). */
export function refOf(r: RefRow): ScriptureRef {
  const ref: ScriptureRef = { book: r.book, chapter: r.chapter };
  if (r.verse !== null) ref.verse = r.verse;
  if (r.endChapter !== null) ref.endChapter = r.endChapter;
  if (r.endVerse !== null) ref.endVerse = r.endVerse;
  return ref;
}

function toNoteRef(r: RefRow): NoteRef {
  return {
    id: r.id,
    ...refOf(r),
    // The column only ever holds a NoteRefOrigin (written by the stores)
    origin: r.origin as NoteRefOrigin,
    position: r.position,
    ...(r.markId &&
      (r.markKind === 'highlight' || r.markKind === 'annotation') && {
        mark: {
          kind: r.markKind,
          id: r.markId,
          translationId: r.markTranslationId,
        },
      }),
  };
}

/** Assembles the wire Note from its rows (also used by ConnectionsService). */
export function toNote(
  row: NoteRow,
  anchors: AnchorRow[],
  refs: RefRow[],
): Note {
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
    refs: refs.map(toNoteRef),
  };
}
