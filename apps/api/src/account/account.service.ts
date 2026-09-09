import { Injectable } from '@nestjs/common';
import type { NoteStore } from '../notes/notes.store';
import type { TagStore } from '../tags/tags.store';
import type { AccountStore } from './account.store';

/**
 * Account deletion (issue #17, App Store 5.1.1(v)): wipes EVERYTHING the user
 * owns — notes (+ anchors + tag links), own tags (+ passage links), highlights,
 * annotations, Better Auth sessions, then the user row. The cascade is explicit
 * through the store seams (not left to FK cascade) so in-memory and Drizzle
 * behave identically and tag orphan-cleanup matches TagsService semantics.
 */
@Injectable()
export class AccountService {
  constructor(
    private readonly accounts: AccountStore,
    private readonly notes: NoteStore,
    private readonly tags: TagStore,
  ) {}

  /** Deletes the user and all their data. False = no such user (e.g. already
   * deleted) — nothing touched. */
  async deleteAccount(userId: string): Promise<boolean> {
    if (!(await this.accounts.userExists(userId))) return false;

    // Notes: drop tag links first (remembering which tags may orphan), then
    // the notes themselves — anchors go with the note.
    const noteIds = (await this.notes.listNotes(userId)).map((n) => n.id);
    const links = await this.tags.tagsForNotes(noteIds);
    for (const link of links) {
      await this.tags.untagNote(link.noteId, link.id);
    }
    for (const id of noteIds) {
      await this.notes.deleteNote(userId, id);
    }

    // Own tags: drop remaining note + passage links, then the tag itself.
    for (const tag of await this.tags.listTags(userId)) {
      for (const noteId of await this.tags.noteIdsWithTag(tag.id)) {
        await this.tags.untagNote(noteId, tag.id);
      }
      for (const passage of await this.tags.passagesWithTag(tag.id)) {
        await this.tags.untagPassage(tag.id, passage);
      }
      await this.tags.deleteTag(tag.id);
    }

    // Another user's tag that only pointed at this user's notes is now an
    // orphan — same last-use cleanup rule as TagsService.
    const foreignTagIds = new Set(
      links.filter((l) => l.userId !== userId).map((l) => l.id),
    );
    for (const tagId of foreignTagIds) {
      if (!(await this.tags.isTagUsed(tagId))) {
        await this.tags.deleteTag(tagId);
      }
    }

    await this.accounts.deleteHighlights(userId);
    await this.accounts.deleteAnnotations(userId);
    await this.accounts.deleteSessions(userId);
    await this.accounts.deleteUser(userId);
    return true;
  }
}
