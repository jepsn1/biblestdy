import { type Anchor, type CitedRef } from '@biblestdy/shared';
import type { AnchorRow, NoteRow, NoteStore, RefRow } from './notes.store';
import { refOf } from './notes.service';

/** In-memory NoteStore: graph rules and panel assembly (NotesService,
 * ConnectionsService) get behavior-tested without a DB. */
export class InMemoryNoteStore implements NoteStore {
  private notes: (NoteRow & { deleted?: boolean })[] = [];
  private anchors: AnchorRow[] = [];
  private refs: RefRow[] = [];
  /** The users' live marks (#216): id → owner + translation. */
  private marks = new Map<string, { userId: string; translationId: string }>();
  private seq = 0;

  /** Test seam: a live mark of a user's (translationId null = erased). */
  setMark(id: string, userId: string, translationId: string | null) {
    if (translationId === null) this.marks.delete(id);
    else this.marks.set(id, { userId, translationId });
  }
  private tick = 0;

  /** Strictly increasing edit times — list order is deterministic. */
  private stamp() {
    return new Date(Date.UTC(2026, 0, 1) + ++this.tick * 1000);
  }

  private nextId() {
    return `id-${++this.seq}`;
  }

  insertNote(
    userId: string,
    data: { title: string; body: string },
    inlineRefs?: CitedRef[],
  ) {
    const row = { id: this.nextId(), userId, ...data, updatedAt: this.stamp() };
    this.notes.push(row);
    if (inlineRefs) this.replaceInline(row.id, inlineRefs);
    return Promise.resolve(row);
  }

  private replaceInline(noteId: string, refs: CitedRef[]) {
    this.refs = this.refs.filter(
      (r) => !(r.noteId === noteId && r.origin === 'inline'),
    );
    refs.forEach((r, position) =>
      this.refs.push({
        id: this.nextId(),
        noteId,
        book: r.book,
        chapter: r.chapter,
        verse: r.verse ?? null,
        endChapter: r.endChapter ?? null,
        endVerse: r.endVerse ?? null,
        origin: 'inline',
        position,
        markKind: r.mark?.kind ?? null,
        markId: r.mark?.id ?? null,
        markTranslationId: null,
      }),
    );
  }

  getNote(userId: string, id: string) {
    return Promise.resolve(
      this.notes.find(
        (n) => n.id === id && n.userId === userId && !n.deleted,
      ) ?? null,
    );
  }

  /** Live notes only (soft delete, #64). */
  private live() {
    return this.notes.filter((n) => !n.deleted);
  }

  async updateNote(
    userId: string,
    id: string,
    patch: { title?: string; body?: string },
    inlineRefs?: CitedRef[],
  ) {
    const row = await this.getNote(userId, id);
    if (!row) return null;
    Object.assign(row, patch, { updatedAt: this.stamp() });
    if (inlineRefs) this.replaceInline(id, inlineRefs);
    return row;
  }

  async deleteNote(userId: string, id: string) {
    const row = await this.getNote(userId, id);
    if (!row) return false;
    row.deleted = true;
    return true;
  }

  restoreNote(userId: string, id: string) {
    const row = this.notes.find(
      (n) => n.id === id && n.userId === userId && n.deleted,
    );
    if (row) row.deleted = false;
    return Promise.resolve(row ?? null);
  }

  allNoteIds(userId: string) {
    return Promise.resolve(
      this.notes.filter((n) => n.userId === userId).map((n) => n.id),
    );
  }

  purgeNote(userId: string, id: string) {
    const row = this.notes.find((n) => n.id === id && n.userId === userId);
    if (!row) return Promise.resolve(false);
    this.notes = this.notes.filter((n) => n !== row);
    this.anchors = this.anchors.filter((a) => a.noteId !== id);
    this.refs = this.refs.filter((r) => r.noteId !== id);
    return Promise.resolve(true);
  }

  listNotes(userId: string) {
    return Promise.resolve(
      this.live()
        .filter((n) => n.userId === userId)
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()),
    );
  }

  notesInChapters(userId: string, book: string, chapters: readonly number[]) {
    const lo = Math.min(...chapters);
    const hi = Math.max(...chapters);
    return Promise.resolve(
      this.live().filter(
        (n) =>
          n.userId === userId &&
          (this.anchors.some(
            (a) =>
              a.noteId === n.id &&
              a.book === book &&
              chapters.includes(a.chapter),
          ) ||
            this.refs.some((r) => {
              if (r.noteId !== n.id) return false;
              const ref = refOf(r);
              return (
                ref.book === book &&
                ref.chapter <= hi &&
                (ref.endChapter ?? ref.chapter) >= lo
              );
            })),
      ),
    );
  }

  refsFor(noteIds: string[]) {
    const owner = (noteId: string) =>
      this.notes.find((n) => n.id === noteId)?.userId;
    return Promise.resolve(
      this.refs
        .filter((r) => noteIds.includes(r.noteId))
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map((r) => {
          const m = r.markId ? this.marks.get(r.markId) : undefined;
          const mine = m && m.userId === owner(r.noteId);
          return { ...r, markTranslationId: mine ? m.translationId : null };
        }),
    );
  }

  insertAnchor(noteId: string, anchor: Anchor) {
    const row = { id: this.nextId(), noteId, ...anchor };
    this.anchors.push(row);
    return Promise.resolve(row);
  }

  deleteAnchor(noteId: string, anchorId: string) {
    const before = this.anchors.length;
    this.anchors = this.anchors.filter(
      (a) => !(a.noteId === noteId && a.id === anchorId),
    );
    return Promise.resolve(this.anchors.length < before);
  }

  anchorsFor(noteIds: string[]) {
    return Promise.resolve(
      this.anchors.filter((a) => noteIds.includes(a.noteId)),
    );
  }
}
