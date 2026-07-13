import type { Anchor } from '@biblestdy/shared';
import type { AnchorRow, NoteRow, NoteStore } from './notes.store';

/** In-memory NoteStore: graph rules and panel assembly (NotesService,
 * ConnectionsService) get behavior-tested without a DB. */
export class InMemoryNoteStore implements NoteStore {
  private notes: (NoteRow & { updatedAt: number })[] = [];
  private anchors: AnchorRow[] = [];
  private seq = 0;
  private tick = 0;

  private nextId() {
    return `id-${++this.seq}`;
  }

  insertNote(userId: string, data: { title: string; body: string }) {
    const row = { id: this.nextId(), userId, ...data, updatedAt: ++this.tick };
    this.notes.push(row);
    return Promise.resolve(row);
  }

  getNote(userId: string, id: string) {
    return Promise.resolve(
      this.notes.find((n) => n.id === id && n.userId === userId) ?? null,
    );
  }

  async updateNote(
    userId: string,
    id: string,
    patch: { title?: string; body?: string },
  ) {
    const row = await this.getNote(userId, id);
    if (!row) return null;
    Object.assign(row, patch, { updatedAt: ++this.tick });
    return row;
  }

  async deleteNote(userId: string, id: string) {
    const row = await this.getNote(userId, id);
    if (!row) return false;
    this.notes = this.notes.filter((n) => n !== row);
    this.anchors = this.anchors.filter((a) => a.noteId !== id);
    return true;
  }

  listNotes(userId: string) {
    return Promise.resolve(
      this.notes
        .filter((n) => n.userId === userId)
        .sort((a, b) => b.updatedAt - a.updatedAt),
    );
  }

  notesWithAnchorIn(
    userId: string,
    translationId: string,
    book: string,
    chapter: number,
  ) {
    return Promise.resolve(
      this.notes.filter(
        (n) =>
          n.userId === userId &&
          this.anchors.some(
            (a) =>
              a.noteId === n.id &&
              a.translationId === translationId &&
              a.book === book &&
              a.chapter === chapter,
          ),
      ),
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

  anchorsInChapter(userId: string, book: string, chapter: number) {
    const mine = new Set(
      this.notes.filter((n) => n.userId === userId).map((n) => n.id),
    );
    return Promise.resolve(
      this.anchors.filter(
        (a) => mine.has(a.noteId) && a.book === book && a.chapter === chapter,
      ),
    );
  }
}
