import { describe, expect, it } from 'vitest';
import type { Anchor } from '@biblestdy/shared';
import { InMemoryNoteStore } from '../notes/in-memory-store';
import { NotesService } from '../notes/notes.service';
import { InMemoryTagStore } from '../tags/in-memory-store';
import { TagsService } from '../tags/tags.service';
import { AccountService } from './account.service';
import { InMemoryAccountStore } from './in-memory-store';

const jhn3: Anchor = {
  translationId: 'WEB',
  book: 'JHN',
  chapter: 3,
  startVerse: 16,
  startWord: 0,
  endVerse: 16,
  endWord: 4,
};
const gen1Passage = { translationId: 'WEB', book: 'GEN', chapter: 1 };

function make() {
  const noteStore = new InMemoryNoteStore();
  const tagStore = new InMemoryTagStore();
  const accountStore = new InMemoryAccountStore();
  return {
    noteStore,
    tagStore,
    accountStore,
    notes: new NotesService(noteStore),
    tags: new TagsService(tagStore, noteStore),
    account: new AccountService(accountStore, noteStore, tagStore),
  };
}

type Ctx = ReturnType<typeof make>;

/** A user with one of everything: note (+anchor), note tag, passage tag,
 * highlight, annotation, session. */
async function seedUser(ctx: Ctx, userId: string) {
  ctx.accountStore.addUser(userId);
  const note = await ctx.notes.create(userId, jhn3);
  await ctx.tags.tagNote(userId, note.id, 'grace');
  await ctx.tags.tagPassage(userId, gen1Passage, 'creation');
  ctx.accountStore.addHighlight(userId);
  ctx.accountStore.addAnnotation(userId);
  ctx.accountStore.addSession(userId);
  return note;
}

describe('AccountService (cascade account deletion, issue #17)', () => {
  it('wipes every owned entity class: notes, anchors, tags, highlights, annotations, sessions, user', async () => {
    const ctx = make();
    const note = await seedUser(ctx, 'u1');

    expect(await ctx.account.deleteAccount('u1')).toBe(true);

    expect(await ctx.notes.listAll('u1')).toEqual([]);
    expect(await ctx.noteStore.anchorsFor([note.id])).toEqual([]);
    expect(await ctx.tags.listTags('u1')).toEqual([]);
    expect(ctx.accountStore.highlightCount('u1')).toBe(0);
    expect(ctx.accountStore.annotationCount('u1')).toBe(0);
    expect(ctx.accountStore.sessionCount('u1')).toBe(0);
    expect(ctx.accountStore.hasUser('u1')).toBe(false);
  });

  it('removes note-tag and passage-tag links, not just the tag rows', async () => {
    const ctx = make();
    const note = await seedUser(ctx, 'u1');
    const [grace] = (await ctx.tags.listTags('u1')).filter(
      (t) => t.name === 'grace',
    );
    const [creation] = (await ctx.tags.listTags('u1')).filter(
      (t) => t.name === 'creation',
    );

    await ctx.account.deleteAccount('u1');

    expect(await ctx.tagStore.noteIdsWithTag(grace.id)).toEqual([]);
    expect(await ctx.tagStore.passagesWithTag(creation.id)).toEqual([]);
    expect(await ctx.tagStore.tagsForNotes([note.id])).toEqual([]);
  });

  it("leaves another user's data completely untouched", async () => {
    const ctx = make();
    await seedUser(ctx, 'u1');
    const otherNote = await seedUser(ctx, 'u2');

    await ctx.account.deleteAccount('u1');

    expect(await ctx.notes.listAll('u2')).toHaveLength(1);
    expect(await ctx.noteStore.anchorsFor([otherNote.id])).toHaveLength(1);
    expect((await ctx.tags.listTags('u2')).map((t) => t.name).sort()).toEqual([
      'creation',
      'grace',
    ]);
    expect(await ctx.tags.tagsForPassage('u2', gen1Passage)).toHaveLength(1);
    expect(ctx.accountStore.highlightCount('u2')).toBe(1);
    expect(ctx.accountStore.annotationCount('u2')).toBe(1);
    expect(ctx.accountStore.sessionCount('u2')).toBe(1);
    expect(ctx.accountStore.hasUser('u2')).toBe(true);
  });

  it("a tag shared onto the deleted user's note survives while its owner still uses it", async () => {
    const ctx = make();
    const doomed = await seedUser(ctx, 'u1');
    ctx.accountStore.addUser('u2');
    const keeperNote = await ctx.notes.create('u2', jhn3);
    await ctx.tags.tagNote('u2', keeperNote.id, 'shared');
    const [shared] = await ctx.tags.listTags('u2');
    // Store-level cross-link: u2's tag also points at u1's note
    await ctx.tagStore.tagNote(doomed.id, shared.id);

    await ctx.account.deleteAccount('u1');

    expect(await ctx.tags.listTags('u2')).toEqual([
      expect.objectContaining({ name: 'shared' }),
    ]);
    expect(await ctx.tagStore.noteIdsWithTag(shared.id)).toEqual([
      keeperNote.id,
    ]);
  });

  it("another user's tag used ONLY on the deleted user's notes is cleaned up as an orphan", async () => {
    const ctx = make();
    const doomed = await seedUser(ctx, 'u1');
    ctx.accountStore.addUser('u2');
    const orphan = await ctx.tagStore.insertTag('u2', 'only-there');
    await ctx.tagStore.tagNote(doomed.id, orphan.id);

    await ctx.account.deleteAccount('u1');

    expect(await ctx.tags.listTags('u2')).toEqual([]);
  });

  it('second delete and unknown user return false without touching anything', async () => {
    const ctx = make();
    await seedUser(ctx, 'u1');
    await seedUser(ctx, 'u2');

    expect(await ctx.account.deleteAccount('ghost')).toBe(false);
    expect(await ctx.notes.listAll('u1')).toHaveLength(1);

    expect(await ctx.account.deleteAccount('u1')).toBe(true);
    expect(await ctx.account.deleteAccount('u1')).toBe(false);
    expect(await ctx.notes.listAll('u2')).toHaveLength(1);
    expect(ctx.accountStore.hasUser('u2')).toBe(true);
  });
});
