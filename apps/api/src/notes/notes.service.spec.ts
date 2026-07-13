import { describe, expect, it } from 'vitest';
import type { Anchor } from '@biblestdy/shared';
import { NotesService } from './notes.service';
import { InMemoryNoteStore } from './in-memory-store';

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

function make() {
  return new NotesService(new InMemoryNoteStore());
}

describe('NotesService (note↔anchor graph)', () => {
  it('creates a note on its first anchor', async () => {
    const svc = make();
    const note = await svc.create('u1', { ...jhn3, title: 'Grace' });
    expect(note.title).toBe('Grace');
    expect(note.anchors).toHaveLength(1);
    expect(note.anchors[0]).toMatchObject(jhn3);
  });

  it('anchors an existing note to a second passage; both chapters list it with ALL anchors', async () => {
    const svc = make();
    const note = await svc.create('u1', jhn3);
    await svc.addAnchor('u1', note.id, gen1);

    for (const [book, chapter] of [
      ['JHN', 3],
      ['GEN', 1],
    ] as const) {
      const listed = await svc.listForChapter('u1', 'WEB', book, chapter);
      expect(listed).toHaveLength(1);
      expect(listed[0].id).toBe(note.id);
      expect(listed[0].anchors).toHaveLength(2);
    }
  });

  it('re-anchoring the exact same span is a no-op', async () => {
    const svc = make();
    const note = await svc.create('u1', jhn3);
    const updated = await svc.addAnchor('u1', note.id, jhn3);
    expect(updated?.anchors).toHaveLength(1);
  });

  it('removes one anchor; the note stays in its other chapter', async () => {
    const svc = make();
    const note = await svc.create('u1', jhn3);
    const updated = await svc.addAnchor('u1', note.id, gen1);
    const genAnchor = updated!.anchors.find((a) => a.book === 'GEN')!;

    const after = await svc.removeAnchor('u1', note.id, genAnchor.id);
    expect(after).toMatchObject({ id: note.id });
    expect((after as { anchors: unknown[] }).anchors).toHaveLength(1);
    expect(await svc.listForChapter('u1', 'WEB', 'GEN', 1)).toHaveLength(0);
    expect(await svc.listForChapter('u1', 'WEB', 'JHN', 3)).toHaveLength(1);
  });

  it('refuses to remove the last anchor', async () => {
    const svc = make();
    const note = await svc.create('u1', jhn3);
    expect(await svc.removeAnchor('u1', note.id, note.anchors[0].id)).toBe(
      'last-anchor',
    );
  });

  it('anchor ops are scoped to the owner', async () => {
    const svc = make();
    const note = await svc.create('u1', jhn3);
    expect(await svc.addAnchor('u2', note.id, gen1)).toBeNull();
    expect(await svc.removeAnchor('u2', note.id, note.anchors[0].id)).toBe(
      'not-found',
    );
  });

  it('removing an unknown anchor id is not-found', async () => {
    const svc = make();
    const note = await svc.create('u1', jhn3);
    await svc.addAnchor('u1', note.id, gen1);
    expect(await svc.removeAnchor('u1', note.id, 'nope')).toBe('not-found');
  });

  it('deleting a note removes it from every chapter', async () => {
    const svc = make();
    const note = await svc.create('u1', jhn3);
    await svc.addAnchor('u1', note.id, gen1);
    await svc.remove('u1', note.id);
    expect(await svc.listForChapter('u1', 'WEB', 'JHN', 3)).toHaveLength(0);
    expect(await svc.listForChapter('u1', 'WEB', 'GEN', 1)).toHaveLength(0);
  });

  it('a chapter with two anchors of the same note lists it once', async () => {
    const svc = make();
    const note = await svc.create('u1', jhn3);
    await svc.addAnchor('u1', note.id, {
      ...jhn3,
      startVerse: 18,
      endVerse: 18,
    });
    const listed = await svc.listForChapter('u1', 'WEB', 'JHN', 3);
    expect(listed).toHaveLength(1);
    expect(listed[0].anchors).toHaveLength(2);
  });

  it('listAll returns every note with anchors, only for that user', async () => {
    const svc = make();
    await svc.create('u1', jhn3);
    await svc.create('u1', psa23);
    await svc.create('u2', gen1);
    const all = await svc.listAll('u1');
    expect(all).toHaveLength(2);
    expect(all.every((n) => n.anchors.length === 1)).toBe(true);
  });
});
