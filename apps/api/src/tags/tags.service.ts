import { Injectable } from '@nestjs/common';
import { compareReferences, type Note, type Tag } from '@biblestdy/shared';
import { toNote } from '../notes/notes.service';
import type { NoteStore } from '../notes/notes.store';
import type { PassageRef, TagStore } from './tags.store';

/** What a topic page shows: everything carrying the tag. */
export interface Topic {
  tag: Tag;
  notes: Note[];
  passages: PassageRef[];
}

/** Tag names are normalized so "Grace" and " grace " are one topic. */
export function normalizeTagName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

const MAX_TAG_LENGTH = 40;

/**
 * Tags/topics (issue #10): lightweight labels on notes and passages, grouping
 * study across the graph. Rules here — normalization, get-or-create on tag,
 * ownership via the note graph, orphan tags deleted on last untag.
 */
@Injectable()
export class TagsService {
  constructor(
    private readonly tags: TagStore,
    private readonly notes: NoteStore,
  ) {}

  listTags(userId: string): Promise<Tag[]> {
    return this.tags.listTags(userId).then(strip);
  }

  /** Tags of one note the user owns; null if not theirs. */
  async tagsForNote(userId: string, noteId: string): Promise<Tag[] | null> {
    if (!(await this.notes.getNote(userId, noteId))) return null;
    return strip(await this.tags.tagsForNotes([noteId]));
  }

  tagsForPassage(userId: string, passage: PassageRef): Promise<Tag[]> {
    return this.tags.tagsForPassage(userId, passage).then(strip);
  }

  /** Tags the note, creating the tag on first use. Null = not the user's note,
   * 'invalid-name' = empty/too long after normalization. */
  async tagNote(
    userId: string,
    noteId: string,
    name: string,
  ): Promise<Tag[] | null | 'invalid-name'> {
    if (!(await this.notes.getNote(userId, noteId))) return null;
    const tag = await this.getOrCreate(userId, name);
    if (tag === 'invalid-name') return tag;
    await this.tags.tagNote(noteId, tag.id);
    return strip(await this.tags.tagsForNotes([noteId]));
  }

  /** Untags the note; a tag used nowhere else is deleted. Null = not found. */
  async untagNote(
    userId: string,
    noteId: string,
    tagId: string,
  ): Promise<Tag[] | null> {
    if (!(await this.notes.getNote(userId, noteId))) return null;
    if (!(await this.tags.untagNote(noteId, tagId))) return null;
    await this.dropIfUnused(tagId);
    return strip(await this.tags.tagsForNotes([noteId]));
  }

  async tagPassage(
    userId: string,
    passage: PassageRef,
    name: string,
  ): Promise<Tag[] | 'invalid-name'> {
    const tag = await this.getOrCreate(userId, name);
    if (tag === 'invalid-name') return tag;
    await this.tags.tagPassage(tag.id, passage);
    return this.tagsForPassage(userId, passage);
  }

  /** Null = the user has no such tag on that passage. */
  async untagPassage(
    userId: string,
    passage: PassageRef,
    tagId: string,
  ): Promise<Tag[] | null> {
    // The tag must be the user's own — passage rows carry no user id
    const owned = (await this.tags.listTags(userId)).some(
      (t) => t.id === tagId,
    );
    if (!owned || !(await this.tags.untagPassage(tagId, passage))) return null;
    await this.dropIfUnused(tagId);
    return this.tagsForPassage(userId, passage);
  }

  /** The topic page: every note and passage carrying the tag. Null if the
   * user has no tag of that name. */
  async topic(userId: string, name: string): Promise<Topic | null> {
    const tag = await this.tags.getTagByName(userId, normalizeTagName(name));
    if (!tag) return null;
    const noteIds = await this.tags.noteIdsWithTag(tag.id);
    const anchors = await this.notes.anchorsFor(noteIds);
    const notes: Note[] = [];
    for (const id of noteIds) {
      const row = await this.notes.getNote(userId, id);
      if (row)
        notes.push(
          toNote(
            row,
            anchors.filter((a) => a.noteId === id),
          ),
        );
    }
    const passages = (await this.tags.passagesWithTag(tag.id)).sort((a, b) =>
      compareReferences(
        { book: a.book, chapter: a.chapter },
        { book: b.book, chapter: b.chapter },
      ),
    );
    return { tag: { id: tag.id, name: tag.name }, notes, passages };
  }

  private async getOrCreate(
    userId: string,
    rawName: string,
  ): Promise<{ id: string; name: string } | 'invalid-name'> {
    const name = normalizeTagName(rawName);
    if (!name || name.length > MAX_TAG_LENGTH) return 'invalid-name';
    const existing = await this.tags.getTagByName(userId, name);
    return existing ?? (await this.tags.insertTag(userId, name));
  }

  private async dropIfUnused(tagId: string): Promise<void> {
    if (!(await this.tags.isTagUsed(tagId))) await this.tags.deleteTag(tagId);
  }
}

function strip(rows: { id: string; name: string }[]): Tag[] {
  const seen = new Set<string>();
  return rows
    .filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)))
    .map((t) => ({ id: t.id, name: t.name }));
}
