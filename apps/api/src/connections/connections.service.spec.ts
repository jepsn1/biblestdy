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
  it('a note here carries ALL its anchors (rows name its other passages)', async () => {
    const { notes, connections } = make();
    const note = await notes.create('u1', { ...jhn3, title: 'Grace' });
    await notes.addAnchor('u1', note.id, gen1);
    const panel = await connections.forChapter('u1', 'WEB', 'JHN', 3);
    expect(panel.notesHere[0].anchors.map((a) => a.book)).toEqual([
      'JHN',
      'GEN',
    ]);
  });

  it('a chapter with no notes has none, whatever else exists', async () => {
    const { notes, connections } = make();
    await notes.create('u1', { ...psa23, title: 'Shepherd' });
    const panel = await connections.forChapter('u1', 'WEB', 'JHN', 3);
    expect(panel.notesHere).toEqual([]);
  });

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

  it('a deleted note leaves the panel; restoring brings it back (#64)', async () => {
    const { notes, connections } = make();
    const note = await notes.create('u1', { ...jhn3, title: 'Gone' });
    await notes.addAnchor('u1', note.id, gen1);
    await notes.remove('u1', note.id);

    const panel = await connections.forChapter('u1', 'WEB', 'JHN', 3);
    expect(panel.notesHere).toEqual([]);

    await notes.restore('u1', note.id);
    const back = await connections.forChapter('u1', 'WEB', 'JHN', 3);
    expect(back.notesHere.map((n) => n.id)).toEqual([note.id]);
    expect(back.notesHere[0].anchors).toHaveLength(2); // all its anchors
  });

  it('assembles only the requesting user own graph', async () => {
    const { notes, connections } = make();
    await notes.create('u1', { ...jhn3, title: 'mine' });
    const theirs = await notes.create('u2', { ...jhn3, title: 'theirs' });
    await notes.addAnchor('u2', theirs.id, gen1);

    const panel = await connections.forChapter('u1', 'WEB', 'JHN', 3);
    expect(panel.notesHere.map((n) => n.title)).toEqual(['mine']);
  });
});
