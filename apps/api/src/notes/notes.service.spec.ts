import { describe, expect, it } from 'vitest';
import { formatScriptureHref, type Anchor } from '@biblestdy/shared';
import { NotesService } from './notes.service';
import { InMemoryNoteStore } from './in-memory-store';
import { InMemoryTagStore } from '../tags/in-memory-store';
import { TagsService } from '../tags/tags.service';

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
      const listed = await svc.listForChapter('u1', book, chapter);
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
    expect(await svc.listForChapter('u1', 'GEN', 1)).toHaveLength(0);
    expect(await svc.listForChapter('u1', 'JHN', 3)).toHaveLength(1);
  });

  it('removes the last anchor too; the note lives on without passages', async () => {
    const svc = make();
    const note = await svc.create('u1', jhn3);
    const after = await svc.removeAnchor('u1', note.id, note.anchors[0].id);
    expect(after && after.anchors).toEqual([]);
    expect(await svc.listForChapter('u1', 'JHN', 3)).toHaveLength(0);
    expect((await svc.listAll('u1')).map((n) => n.id)).toEqual([note.id]);
  });

  it('creates a draft with no passage: on the Notes list, in no chapter', async () => {
    const svc = make();
    const note = await svc.create('u1', { title: 'Sermon', body: '# Outline' });
    expect(note.anchors).toEqual([]);
    expect(note.title).toBe('Sermon');
    expect(await svc.listForChapter('u1', 'JHN', 3)).toHaveLength(0);
    const later = await svc.addAnchor('u1', note.id, jhn3);
    expect(later?.anchors).toHaveLength(1);
    expect(await svc.listForChapter('u1', 'JHN', 3)).toHaveLength(1);
  });

  it('adding or removing a reference counts as an edit (list order)', async () => {
    const svc = make();
    const a = await svc.create('u1', jhn3);
    const b = await svc.create('u1', gen1);
    expect((await svc.listAll('u1')).map((n) => n.id)).toEqual([b.id, a.id]);
    await svc.addAnchor('u1', a.id, psa23);
    expect((await svc.listAll('u1')).map((n) => n.id)).toEqual([a.id, b.id]);
    // The same span again changes nothing
    await svc.addAnchor('u1', b.id, gen1);
    expect((await svc.listAll('u1'))[0].id).toBe(a.id);
  });

  it('a note carries its last-edit time', async () => {
    const svc = make();
    const note = await svc.create('u1', jhn3);
    expect(Date.parse(note.updatedAt)).not.toBeNaN();
  });

  it('anchor ops are scoped to the owner', async () => {
    const svc = make();
    const note = await svc.create('u1', jhn3);
    expect(await svc.addAnchor('u2', note.id, gen1)).toBeNull();
    expect(
      await svc.removeAnchor('u2', note.id, note.anchors[0].id),
    ).toBeNull();
  });

  it('removing an unknown anchor id is not-found', async () => {
    const svc = make();
    const note = await svc.create('u1', jhn3);
    await svc.addAnchor('u1', note.id, gen1);
    expect(await svc.removeAnchor('u1', note.id, 'nope')).toBeNull();
  });

  it('deleting a note removes it from every chapter', async () => {
    const svc = make();
    const note = await svc.create('u1', jhn3);
    await svc.addAnchor('u1', note.id, gen1);
    await svc.remove('u1', note.id);
    expect(await svc.listForChapter('u1', 'JHN', 3)).toHaveLength(0);
    expect(await svc.listForChapter('u1', 'GEN', 1)).toHaveLength(0);
  });

  it('a deleted note is invisible everywhere until restored, anchors intact (#64)', async () => {
    const svc = make();
    const web2 = { ...jhn3, translationId: 'WEB2' };
    const note = await svc.create('u1', { ...jhn3, title: 'Grace' });
    await svc.addAnchor('u1', note.id, gen1);
    await svc.addAnchor('u1', note.id, web2);
    expect(await svc.remove('u1', note.id)).toBe(true);

    expect(await svc.listAll('u1')).toEqual([]);
    expect(await svc.listForChapter('u1', 'GEN', 1)).toEqual([]);
    expect(await svc.otherVersionNoteCounts('u1', 'WEB', 'JHN', 3)).toEqual([]);
    expect(await svc.update('u1', note.id, { title: 'x' })).toBeNull();
    expect(await svc.addAnchor('u1', note.id, psa23)).toBeNull();
    expect(await svc.remove('u1', note.id)).toBe(false);

    const restored = await svc.restore('u1', note.id);
    expect(restored?.title).toBe('Grace');
    expect(restored?.anchors).toHaveLength(3);
    expect(await svc.listForChapter('u1', 'GEN', 1)).toHaveLength(1);
  });

  it('restore only brings back a deleted note of the same user', async () => {
    const svc = make();
    const note = await svc.create('u1', jhn3);
    expect(await svc.restore('u1', note.id)).toBeNull(); // not deleted
    await svc.remove('u1', note.id);
    expect(await svc.restore('u2', note.id)).toBeNull();
    expect(await svc.restore('u1', 'nope')).toBeNull();
    expect(await svc.restore('u1', note.id)).not.toBeNull();
  });

  it('a chapter with two anchors of the same note lists it once', async () => {
    const svc = make();
    const note = await svc.create('u1', jhn3);
    await svc.addAnchor('u1', note.id, {
      ...jhn3,
      startVerse: 18,
      endVerse: 18,
    });
    const listed = await svc.listForChapter('u1', 'JHN', 3);
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

  it("listAll carries each note's topics when a tag store is given", async () => {
    const notes = new InMemoryNoteStore();
    const tagStore = new InMemoryTagStore();
    const svc = new NotesService(notes, tagStore);
    const tags = new TagsService(tagStore, notes);
    const a = await svc.create('u1', jhn3);
    const b = await svc.create('u1', gen1);
    await tags.tagNote('u1', a.id, 'Grace');
    await tags.tagNote('u1', a.id, 'preaching');
    const all = await svc.listAll('u1');
    expect(all.find((n) => n.id === a.id)?.tags?.map((t) => t.name)).toEqual([
      'grace',
      'preaching',
    ]);
    expect(all.find((n) => n.id === b.id)?.tags).toEqual([]);
  });
});

describe('inline references (note_ref, #158)', () => {
  const hrefs = (n: { refs: { book: string; chapter: number }[] } | null) =>
    n?.refs.map((r) => formatScriptureHref(r));

  it('a body save with 2 refs stores 2 rows in text order; removing one leaves 1', async () => {
    const svc = make();
    const note = await svc.create('u1', { title: 'Serpent' });
    expect(note.refs).toEqual([]);

    const two = await svc.update('u1', note.id, {
      body: 'Look up: [Joh 3,14–15](bible:JHN.3.14-15), cf. [4 Mos 21,9](bible:NUM.21.9) and [Joh 3,14–15](bible:JHN.3.14-15) again.',
    });
    expect(hrefs(two)).toEqual(['bible:JHN.3.14-15', 'bible:NUM.21.9']);
    expect(two?.refs.map((r) => [r.origin, r.position])).toEqual([
      ['inline', 0],
      ['inline', 1],
    ]);

    const one = await svc.update('u1', note.id, {
      body: 'Only [4 Mos 21,9](bible:NUM.21.9) now.',
    });
    expect(hrefs(one)).toEqual(['bible:NUM.21.9']);
    expect(hrefs((await svc.listAll('u1'))[0])).toEqual(['bible:NUM.21.9']);
  });

  it('a title-only save leaves the refs alone; an empty body clears them', async () => {
    const svc = make();
    const note = await svc.create('u1', {
      body: '[Sl 23](bible:PSA.23)',
    });
    expect(hrefs(note)).toEqual(['bible:PSA.23']);
    expect(hrefs(await svc.update('u1', note.id, { title: 'x' }))).toEqual([
      'bible:PSA.23',
    ]);
    expect(hrefs(await svc.update('u1', note.id, { body: '' }))).toEqual([]);
  });

  it('malformed links store nothing', async () => {
    const svc = make();
    const note = await svc.create('u1', {});
    const saved = await svc.update('u1', note.id, {
      body: '[x](bible:XYZ.1.1) [y](bible:JHN.3.18-16) [z](https://x.y)',
    });
    expect(saved?.refs).toEqual([]);
  });

  it('soft delete + restore keeps the refs', async () => {
    const svc = make();
    const note = await svc.create('u1', {
      body: '[Rom 8,28](bible:ROM.8.28)',
    });
    await svc.remove('u1', note.id);
    expect(await svc.listForChapter('u1', 'ROM', 8)).toEqual([]);
    const restored = await svc.restore('u1', note.id);
    expect(hrefs(restored)).toEqual(['bible:ROM.8.28']);
    expect(await svc.listForChapter('u1', 'ROM', 8)).toHaveLength(1);
  });

  it('anchor edits keep the refs on the returned note', async () => {
    const svc = make();
    const note = await svc.create('u1', {
      ...jhn3,
      body: '[Sl 23](bible:PSA.23)',
    });
    const added = await svc.addAnchor('u1', note.id, gen1);
    expect(hrefs(added)).toEqual(['bible:PSA.23']);
    const removed = await svc.removeAnchor('u1', note.id, added!.anchors[1].id);
    expect(hrefs(removed)).toEqual(['bible:PSA.23']);
  });
});

describe('listForChapter across translations (#158)', () => {
  it('finds a WEB-anchored note when the reader is in BPH — the translation no longer filters', async () => {
    const svc = make();
    const note = await svc.create('u1', { ...jhn3, title: 'In WEB' });
    // The controller still takes ?translation=BPH; the service ignores it
    const listed = await svc.listForChapter('u1', 'JHN', 3);
    expect(listed.map((n) => n.id)).toEqual([note.id]);
    expect(listed[0].anchors[0].translationId).toBe('WEB');
  });

  it('finds a note citing JHN.3.16 only inline', async () => {
    const svc = make();
    const note = await svc.create('u1', {
      body: 'God so loved: [Joh 3,16](bible:JHN.3.16)',
    });
    expect((await svc.listForChapter('u1', 'JHN', 3)).map((n) => n.id)).toEqual(
      [note.id],
    );
    expect(await svc.listForChapter('u1', 'JHN', 4)).toEqual([]);
  });

  it('a cross-chapter ref (ROM.8.28-9.5) is found in every chapter it spans', async () => {
    const svc = make();
    const note = await svc.create('u1', {
      body: '[Rom 8,28–9,5](bible:ROM.8.28-9.5)',
    });
    for (const [chapter, found] of [
      [7, false],
      [8, true],
      [9, true],
      [10, false],
    ] as const) {
      const ids = (await svc.listForChapter('u1', 'ROM', chapter)).map(
        (n) => n.id,
      );
      expect(ids, `ROM ${chapter}`).toEqual(found ? [note.id] : []);
    }
  });

  it('a note both anchored and citing the chapter is listed once; other users never', async () => {
    const svc = make();
    await svc.create('u1', { ...jhn3, body: '[Joh 3,17](bible:JHN.3.17)' });
    await svc.create('u2', { body: '[Joh 3,17](bible:JHN.3.17)' });
    expect(await svc.listForChapter('u1', 'JHN', 3)).toHaveLength(1);
  });
});

describe('otherVersionNoteCounts (cross-version correlation, #11)', () => {
  const web2 = { ...jhn3, translationId: 'WEB2' };

  it('counts notes per verse from OTHER translations only', async () => {
    const svc = make();
    await svc.create('u1', jhn3); // home translation -> not counted
    await svc.create('u1', web2); // v16
    await svc.create('u1', { ...web2, startVerse: 18, endVerse: 18 });

    const counts = await svc.otherVersionNoteCounts('u1', 'WEB', 'JHN', 3);
    expect(counts).toEqual([
      { verse: 16, count: 1 },
      { verse: 18, count: 1 },
    ]);
  });

  it('a span covers every verse it touches; two anchors of one note count once', async () => {
    const svc = make();
    const note = await svc.create('u1', { ...web2, endVerse: 17 }); // v16-17
    await svc.addAnchor('u1', note.id, { ...web2, startWord: 3 }); // v16 again

    const counts = await svc.otherVersionNoteCounts('u1', 'WEB', 'JHN', 3);
    expect(counts).toEqual([
      { verse: 16, count: 1 },
      { verse: 17, count: 1 },
    ]);
  });

  it('correlates by canonical reference across the graph, per user', async () => {
    const svc = make();
    // Same note anchored in WEB2 JHN 3 and elsewhere; only JHN 3 correlates
    const note = await svc.create('u1', web2);
    await svc.addAnchor('u1', note.id, gen1);
    await svc.create('u2', web2); // someone else's note

    expect(await svc.otherVersionNoteCounts('u1', 'WEB', 'JHN', 3)).toEqual([
      { verse: 16, count: 1 },
    ]);
    // Viewing WEB2 itself: nothing on other versions
    expect(await svc.otherVersionNoteCounts('u1', 'WEB2', 'JHN', 3)).toEqual(
      [],
    );
  });
});
