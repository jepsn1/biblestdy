import { describe, expect, it } from 'vitest';
import type { Anchor } from '@biblestdy/shared';
import { InMemoryNoteStore } from '../notes/in-memory-store';
import { NotesService } from '../notes/notes.service';
import { InMemoryTagStore } from './in-memory-store';
import { TagsService } from './tags.service';

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
const psa23Passage = { translationId: 'WEB', book: 'PSA', chapter: 23 };

function make() {
  const noteStore = new InMemoryNoteStore();
  return {
    notes: new NotesService(noteStore),
    tags: new TagsService(new InMemoryTagStore(), noteStore),
  };
}

describe('TagsService (tags + topics graph)', () => {
  it('tags a note; "Grace" and " grace " are the same topic', async () => {
    const { notes, tags } = make();
    const note = await notes.create('u1', jhn3);
    await tags.tagNote('u1', note.id, 'Grace');
    const after = await tags.tagNote('u1', note.id, ' grace ');
    expect(after).toEqual([expect.objectContaining({ name: 'grace' })]);
    expect(await tags.listTags('u1')).toHaveLength(1);
  });

  it('rejects empty and over-long names', async () => {
    const { notes, tags } = make();
    const note = await notes.create('u1', jhn3);
    expect(await tags.tagNote('u1', note.id, '   ')).toBe('invalid-name');
    expect(await tags.tagNote('u1', note.id, 'x'.repeat(41))).toBe(
      'invalid-name',
    );
  });

  it('cannot tag someone else note', async () => {
    const { notes, tags } = make();
    const note = await notes.create('u1', jhn3);
    expect(await tags.tagNote('u2', note.id, 'grace')).toBeNull();
  });

  it('topic page aggregates every tagged note and passage', async () => {
    const { notes, tags } = make();
    const a = await notes.create('u1', { ...jhn3, title: 'A' });
    const b = await notes.create('u1', {
      ...jhn3,
      startVerse: 18,
      endVerse: 18,
      title: 'B',
    });
    await tags.tagNote('u1', a.id, 'grace');
    await tags.tagNote('u1', b.id, 'grace');
    await tags.tagPassage('u1', psa23Passage, 'grace');
    await tags.tagPassage('u1', gen1Passage, 'grace');

    const topic = await tags.topic('u1', 'Grace');
    expect(topic).not.toBeNull();
    expect(topic!.notes.map((n) => n.title).sort()).toEqual(['A', 'B']);
    expect(topic!.notes[0].anchors.length).toBeGreaterThan(0);
    // Passages come in canonical order
    expect(topic!.passages.map((p) => `${p.book}.${p.chapter}`)).toEqual([
      'GEN.1',
      'PSA.23',
    ]);
  });

  it('unknown topic is null; other user topics are invisible', async () => {
    const { notes, tags } = make();
    const note = await notes.create('u1', jhn3);
    await tags.tagNote('u1', note.id, 'grace');
    expect(await tags.topic('u1', 'love')).toBeNull();
    expect(await tags.topic('u2', 'grace')).toBeNull();
  });

  it('untagging everywhere deletes the orphan tag; shared use keeps it', async () => {
    const { notes, tags } = make();
    const note = await notes.create('u1', jhn3);
    await tags.tagNote('u1', note.id, 'grace');
    await tags.tagPassage('u1', gen1Passage, 'grace');
    const [tag] = await tags.listTags('u1');

    await tags.untagNote('u1', note.id, tag.id);
    expect(await tags.listTags('u1')).toHaveLength(1); // still on the passage

    await tags.untagPassage('u1', gen1Passage, tag.id);
    expect(await tags.listTags('u1')).toHaveLength(0); // orphan removed
  });

  it('untagging a passage checks tag ownership', async () => {
    const { tags } = make();
    await tags.tagPassage('u1', gen1Passage, 'grace');
    const [tag] = await tags.listTags('u1');
    expect(await tags.untagPassage('u2', gen1Passage, tag.id)).toBeNull();
    expect(await tags.tagsForPassage('u1', gen1Passage)).toHaveLength(1);
  });

  it('deleting a note leaves the tag reachable only through its other carriers', async () => {
    const { notes, tags } = make();
    const note = await notes.create('u1', jhn3);
    await tags.tagNote('u1', note.id, 'grace');
    await tags.tagPassage('u1', gen1Passage, 'grace');
    await notes.remove('u1', note.id);

    const topic = await tags.topic('u1', 'grace');
    expect(topic!.notes).toEqual([]);
    expect(topic!.passages).toHaveLength(1);
  });

  it('tagging the same passage twice with the same name is a no-op', async () => {
    const { tags } = make();
    await tags.tagPassage('u1', gen1Passage, 'grace');
    const after = await tags.tagPassage('u1', gen1Passage, 'grace');
    expect(after).toHaveLength(1);
  });
});
