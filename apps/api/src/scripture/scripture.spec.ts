import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Chapter } from '@biblestdy/shared';
import { describe, expect, it } from 'vitest';
import { parseChapterContent } from './apibible.provider';
import { FakeScriptureProvider } from './fake.provider';
import type { Response } from 'express';
import type { AuthedRequest } from '../auth/session.guard';
import { ReadingQuotaService } from '../reading-quota/service';
import { InMemoryQuotaStore } from '../reading-quota/store';
import type { ScriptureProvider } from './provider';
import { ScriptureController } from './scripture.controller';

describe('ScriptureController (with fake provider)', () => {
  const controller = new ScriptureController(
    new FakeScriptureProvider(),
    new ReadingQuotaService({ store: new InMemoryQuotaStore() }),
  );
  const req = { user: { id: 'reader-1' } } as AuthedRequest;
  const res = { setHeader: () => undefined } as unknown as Response;
  const getChapter = (translationId: string, book: string, chapter: number) =>
    controller.getChapter(
      req,
      res,
      translationId,
      book,
      chapter,
    ) as Promise<Chapter>;

  it('lists translations', async () => {
    const translations = await controller.listTranslations();
    expect(translations).toHaveLength(2); // WEB2 = switcher fixture (#11)
    expect(translations[0]).toMatchObject({ id: 'WEB', language: 'en' });
    expect(translations[1]).toMatchObject({ id: 'WEB2', language: 'en' });
  });

  it('serves a chapter with ordered verses', async () => {
    const chapter = await getChapter('WEB', 'JHN', 3);
    expect(chapter).toMatchObject({
      translationId: 'WEB',
      book: 'JHN',
      chapter: 3,
    });
    expect(chapter.verses).toHaveLength(36);
    expect(chapter.verses[15].verse).toBe(16);
    expect(chapter.verses[15].text).toContain('God so loved the world');
    expect(chapter.sections).toEqual([
      { beforeVerse: 1, title: 'Jesus and Nicodemus' },
      { beforeVerse: 22, title: 'John the Baptizer Exalts Jesus' },
    ]);
  });

  it('accepts lowercase book ids', async () => {
    const chapter = await getChapter('WEB', 'psa', 23);
    expect(chapter.verses).toHaveLength(6);
  });

  it('rejects unknown books and out-of-range chapters', async () => {
    await expect(getChapter('WEB', 'XXX', 1)).rejects.toThrow(
      BadRequestException,
    );
    await expect(getChapter('WEB', 'JHN', 22)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('404s chapters the provider does not have', async () => {
    await expect(getChapter('WEB', 'JHN', 4)).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('ScriptureController chapter bound per versification (#166)', () => {
  // BPH numbers the OT the Hebrew way: Joel has 4 chapters there, 3 in NIV
  const provider: ScriptureProvider = {
    listTranslations: () =>
      Promise.resolve([
        { id: 'bph-id', name: 'BPH', abbreviation: 'BPH', language: 'da' },
        { id: 'niv-id', name: 'NIV', abbreviation: 'NIV', language: 'en' },
      ]),
    getChapter: (translationId, book, chapter) =>
      Promise.resolve({ translationId, book, chapter, verses: [] }),
  };
  const controller = new ScriptureController(
    provider,
    new ReadingQuotaService({ store: new InMemoryQuotaStore() }),
  );
  const req = { user: { id: 'reader-2' } } as AuthedRequest;
  const res = { setHeader: () => undefined } as unknown as Response;
  const get = (id: string, book: string, chapter: number) =>
    controller.getChapter(req, res, id, book, chapter);

  it('serves BPH Joel 4 (its own numbering)', async () => {
    await expect(get('bph-id', 'JOL', 4)).resolves.toMatchObject({
      book: 'JOL',
      chapter: 4,
    });
  });

  it('still rejects NIV Joel 4 and chapters past both schemes', async () => {
    await expect(get('niv-id', 'JOL', 4)).rejects.toThrow(BadRequestException);
    await expect(get('bph-id', 'JOL', 5)).rejects.toThrow(BadRequestException);
    await expect(get('unknown-id', 'JOL', 4)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('lets BPH Malachi 4 through to the provider (a real 404 there)', async () => {
    // The bound is the max of both schemes: English Mal has 4 chapters
    await expect(get('bph-id', 'MAL', 4)).resolves.toMatchObject({
      chapter: 4,
    });
  });
});

describe('parseChapterContent (API.Bible json content)', () => {
  it('flattens verse tags + text nodes into ordered verses', () => {
    const { verses } = parseChapterContent([
      {
        type: 'tag',
        name: 'para',
        items: [
          { type: 'tag', name: 'verse', attrs: { number: '1' } },
          { type: 'text', text: 'In the beginning ' },
          {
            type: 'tag',
            name: 'char',
            items: [{ type: 'text', text: 'God created' }],
          },
          { type: 'tag', name: 'verse', attrs: { number: '2' } },
          { type: 'text', text: 'The earth was formless.' },
        ],
      },
    ]);
    expect(verses).toEqual([
      { verse: 1, text: 'In the beginning God created' },
      { verse: 2, text: 'The earth was formless.' },
    ]);
  });

  it('drops the verse marker label — its number child is never verse text', () => {
    // Real API.Bible shape: the verse tag carries its printed number as a
    // text child. Leaking it shifts every word offset in the anchor system.
    const { verses } = parseChapterContent([
      {
        type: 'tag',
        name: 'para',
        items: [
          {
            type: 'tag',
            name: 'verse',
            attrs: { number: '16' },
            items: [{ type: 'text', text: '16' }],
          },
          { type: 'text', text: 'For God so loved the world' },
        ],
      },
    ]);
    expect(verses).toEqual([{ verse: 16, text: 'For God so loved the world' }]);
  });

  it('ignores text before any verse marker and empty verses', () => {
    const { verses } = parseChapterContent([
      { type: 'text', text: 'Chapter heading noise' },
      { type: 'tag', name: 'verse', attrs: { number: '1' } },
      { type: 'text', text: '  Real text  ' },
    ]);
    expect(verses).toEqual([{ verse: 1, text: 'Real text' }]);
  });

  it('extracts s/s1 heading paragraphs as sections, never into verse text', () => {
    const { verses, sections } = parseChapterContent([
      {
        type: 'tag',
        name: 'para',
        attrs: { style: 's1' },
        items: [{ type: 'text', text: 'Jesus and Nicodemus' }],
      },
      {
        type: 'tag',
        name: 'para',
        attrs: { style: 'p' },
        items: [
          { type: 'tag', name: 'verse', attrs: { number: '1' } },
          { type: 'text', text: 'Now there was a man.' },
        ],
      },
      {
        type: 'tag',
        name: 'para',
        attrs: { style: 's1' },
        items: [{ type: 'text', text: 'A Second Heading' }],
      },
      {
        type: 'tag',
        name: 'para',
        attrs: { style: 'p' },
        items: [
          { type: 'tag', name: 'verse', attrs: { number: '2' } },
          { type: 'text', text: 'More text.' },
        ],
      },
    ]);
    expect(sections).toEqual([
      { beforeVerse: 1, title: 'Jesus and Nicodemus' },
      { beforeVerse: 2, title: 'A Second Heading' },
    ]);
    expect(verses[0].text).toBe('Now there was a man.');
    expect(verses[0].text).not.toContain('Nicodemus,');
  });
});
