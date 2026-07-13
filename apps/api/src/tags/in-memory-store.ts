import type { PassageRef, TagRow, TagStore } from './tags.store';

const samePassage = (a: PassageRef, b: PassageRef) =>
  a.translationId === b.translationId &&
  a.book === b.book &&
  a.chapter === b.chapter;

/** In-memory TagStore for behavior tests (TagsService, ConnectionsService). */
export class InMemoryTagStore implements TagStore {
  private tags: TagRow[] = [];
  private noteTags: { noteId: string; tagId: string }[] = [];
  private passageTags: (PassageRef & { tagId: string })[] = [];
  private seq = 0;

  listTags(userId: string) {
    return Promise.resolve(
      this.tags
        .filter((t) => t.userId === userId)
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
  }

  getTagByName(userId: string, name: string) {
    return Promise.resolve(
      this.tags.find((t) => t.userId === userId && t.name === name) ?? null,
    );
  }

  insertTag(userId: string, name: string) {
    const row = { id: `tag-${++this.seq}`, userId, name };
    this.tags.push(row);
    return Promise.resolve(row);
  }

  deleteTag(tagId: string) {
    this.tags = this.tags.filter((t) => t.id !== tagId);
    return Promise.resolve();
  }

  isTagUsed(tagId: string) {
    return Promise.resolve(
      this.noteTags.some((n) => n.tagId === tagId) ||
        this.passageTags.some((p) => p.tagId === tagId),
    );
  }

  tagNote(noteId: string, tagId: string) {
    if (!this.noteTags.some((n) => n.noteId === noteId && n.tagId === tagId)) {
      this.noteTags.push({ noteId, tagId });
    }
    return Promise.resolve();
  }

  untagNote(noteId: string, tagId: string) {
    const before = this.noteTags.length;
    this.noteTags = this.noteTags.filter(
      (n) => !(n.noteId === noteId && n.tagId === tagId),
    );
    return Promise.resolve(this.noteTags.length < before);
  }

  tagsForNotes(noteIds: string[]) {
    return Promise.resolve(
      this.noteTags
        .filter((n) => noteIds.includes(n.noteId))
        .flatMap((n) => {
          const t = this.tags.find((x) => x.id === n.tagId);
          return t ? [{ ...t, noteId: n.noteId }] : [];
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
  }

  noteIdsWithTag(tagId: string) {
    return Promise.resolve(
      this.noteTags.filter((n) => n.tagId === tagId).map((n) => n.noteId),
    );
  }

  tagPassage(tagId: string, passage: PassageRef) {
    if (
      !this.passageTags.some(
        (p) => p.tagId === tagId && samePassage(p, passage),
      )
    ) {
      this.passageTags.push({ tagId, ...passage });
    }
    return Promise.resolve();
  }

  untagPassage(tagId: string, passage: PassageRef) {
    const before = this.passageTags.length;
    this.passageTags = this.passageTags.filter(
      (p) => !(p.tagId === tagId && samePassage(p, passage)),
    );
    return Promise.resolve(this.passageTags.length < before);
  }

  tagsForPassage(userId: string, passage: PassageRef) {
    return Promise.resolve(
      this.passageTags
        .filter((p) => samePassage(p, passage))
        .flatMap((p) => {
          const t = this.tags.find(
            (x) => x.id === p.tagId && x.userId === userId,
          );
          return t ? [t] : [];
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
  }

  passagesWithTag(tagId: string) {
    return Promise.resolve(
      this.passageTags
        .filter((p) => p.tagId === tagId)
        .map(({ translationId, book, chapter }) => ({
          translationId,
          book,
          chapter,
        })),
    );
  }
}
