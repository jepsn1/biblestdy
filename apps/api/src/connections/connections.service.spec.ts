import { describe, expect, it } from 'vitest';
import type { Anchor } from '@biblestdy/shared';
import { InMemoryNoteStore } from '../notes/in-memory-store';
import { NotesService } from '../notes/notes.service';
import { InMemoryTagStore } from '../tags/in-memory-store';
import { TagsService } from '../tags/tags.service';
import { ConnectionsService } from './connections.service';

const jhn3: Anchor = {
  translationId: 'WEB',
  book: 'JHN',
  chapter: 3,
  startVerse: 16,
  startWord: 0,
  endVerse: 16,
  endWord: 4,
};
const gen1: Anchor = {
  ...jhn3,
  book: 'GEN',
  chapter: 1,
  startVerse: 1,
  endVerse: 1,
};
const psa23: Anchor = {
  ...jhn3,
  book: 'PSA',
  chapter: 23,
  startVerse: 1,
  endVerse: 2,
};

/** Notes are written through the real NotesService — the panel assembles
 * whatever the graph rules actually persisted. */
function make() {
  const store = new InMemoryNoteStore();
  const tagStore = new InMemoryTagStore();
  return {
    notes: new NotesService(store),
    tags: new TagsService(tagStore, store),
    connections: new ConnectionsService(store, tagStore),
  };
}

describe('ConnectionsService (panel assembly)', () => {
  it('shows every note anchored in the chapter, in text order', async () => {
    const { notes, connections } = make();
    const later = await notes.create('u1', {
      ...jhn3,
      startVerse: 18,
      endVerse: 18,
      title: 'Later',
    });
    const earlier = await notes.create('u1', { ...jhn3, title: 'Earlier' });
    await notes.create('u1', { ...psa23, title: 'Elsewhere' });

    const panel = await connections.forChapter('u1', 'WEB', 'JHN', 3);
    expect(panel.notesHere.map((n) => n.id)).toEqual([earlier.id, later.id]);
  });

  it('lists other passages of shared notes; the current chapter is not a connection', async () => {
    const { notes, connections } = make();
    const note = await notes.create('u1', { ...jhn3, title: 'Grace' });
    await notes.addAnchor('u1', note.id, gen1);
    await notes.addAnchor('u1', note.id, psa23);

    const panel = await connections.forChapter('u1', 'WEB', 'JHN', 3);
    expect(panel.alsoAppearsIn.map((p) => `${p.book}.${p.chapter}`)).toEqual([
      'GEN.1',
      'PSA.23',
    ]); // canonical order
    expect(panel.alsoAppearsIn[0].notes).toEqual([
      { id: note.id, title: 'Grace' },
    ]);
  });

  it('merges two notes pointing at the same passage into one link', async () => {
    const { notes, connections } = make();
    const a = await notes.create('u1', { ...jhn3, title: 'A' });
    const b = await notes.create('u1', {
      ...jhn3,
      startVerse: 18,
      endVerse: 18,
      title: 'B',
    });
    await notes.addAnchor('u1', a.id, gen1);
    await notes.addAnchor('u1', b.id, { ...gen1, startVerse: 3, endVerse: 3 });

    const panel = await connections.forChapter('u1', 'WEB', 'JHN', 3);
    expect(panel.alsoAppearsIn).toHaveLength(1);
    expect(panel.alsoAppearsIn[0].notes.map((n) => n.title).sort()).toEqual([
      'A',
      'B',
    ]);
  });

  it('a note anchored twice in the same other chapter links it once', async () => {
    const { notes, connections } = make();
    const note = await notes.create('u1', jhn3);
    await notes.addAnchor('u1', note.id, gen1);
    await notes.addAnchor('u1', note.id, {
      ...gen1,
      startVerse: 5,
      endVerse: 5,
    });

    const panel = await connections.forChapter('u1', 'WEB', 'JHN', 3);
    expect(panel.alsoAppearsIn).toHaveLength(1);
    expect(panel.alsoAppearsIn[0].notes).toHaveLength(1);
  });

  it('recent notes come newest-touched first, capped, with their anchors', async () => {
    const { notes, connections } = make();
    const first = await notes.create('u1', { ...jhn3, title: 'first' });
    for (let i = 0; i < 6; i++) {
      await notes.create('u1', {
        ...psa23,
        startVerse: i + 1,
        endVerse: i + 1,
      });
    }
    // Touching the oldest note bubbles it back to the top
    await notes.update('u1', first.id, { body: 'again' });

    const panel = await connections.forChapter('u1', 'WEB', 'GEN', 1);
    expect(panel.recent).toHaveLength(5);
    expect(panel.recent[0].id).toBe(first.id);
    expect(panel.recent[0].anchors).toHaveLength(1);
  });

  it('an empty chapter still offers recent notes as re-entry', async () => {
    const { notes, connections } = make();
    await notes.create('u1', { ...psa23, title: 'Shepherd' });

    const panel = await connections.forChapter('u1', 'WEB', 'JHN', 3);
    expect(panel.notesHere).toEqual([]);
    expect(panel.alsoAppearsIn).toEqual([]);
    expect(panel.recent.map((n) => n.title)).toEqual(['Shepherd']);
  });

  it('topics union the chapter tags and the tags of notes anchored here', async () => {
    const { notes, tags, connections } = make();
    const note = await notes.create('u1', { ...jhn3, title: 'Grace' });
    await tags.tagNote('u1', note.id, 'Love');
    await tags.tagPassage(
      'u1',
      { translationId: 'WEB', book: 'JHN', chapter: 3 },
      'gospel',
    );
    // Another user's tag on the same passage stays invisible
    await tags.tagPassage(
      'u2',
      { translationId: 'WEB', book: 'JHN', chapter: 3 },
      'other',
    );

    const panel = await connections.forChapter('u1', 'WEB', 'JHN', 3);
    expect(panel.topics.map((t) => `${t.name}:${t.onPassage}`)).toEqual([
      'gospel:true',
      'love:false',
    ]);
  });

  it('assembles only the requesting user own graph', async () => {
    const { notes, connections } = make();
    await notes.create('u1', { ...jhn3, title: 'mine' });
    const theirs = await notes.create('u2', { ...jhn3, title: 'theirs' });
    await notes.addAnchor('u2', theirs.id, gen1);

    const panel = await connections.forChapter('u1', 'WEB', 'JHN', 3);
    expect(panel.notesHere.map((n) => n.title)).toEqual(['mine']);
    expect(panel.alsoAppearsIn).toEqual([]);
    expect(panel.recent.map((n) => n.title)).toEqual(['mine']);
  });
});
