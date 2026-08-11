import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { parseChapterContent } from './apibible.provider';
import { CachingScriptureProvider } from './caching.provider';
import { FakeScriptureProvider } from './fake.provider';
import type { ScriptureProvider } from './provider';
import { ScriptureController } from './scripture.controller';

describe('ScriptureController (with fake provider)', () => {
  const controller = new ScriptureController(new FakeScriptureProvider());

  it('lists translations', async () => {
    const translations = await controller.listTranslations();
    expect(translations).toHaveLength(2); // WEB2 = switcher fixture (#11)
    expect(translations[0]).toMatchObject({ id: 'WEB', language: 'en' });
    expect(translations[1]).toMatchObject({ id: 'WEB2', language: 'en' });
  });

  it('serves a chapter with ordered verses', async () => {
    const chapter = await controller.getChapter('WEB', 'JHN', 3);
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
    const chapter = await controller.getChapter('WEB', 'psa', 23);
    expect(chapter.verses).toHaveLength(6);
  });

  it('rejects unknown books and out-of-range chapters', async () => {
    await expect(controller.getChapter('WEB', 'XXX', 1)).rejects.toThrow(
      BadRequestException,
    );
    await expect(controller.getChapter('WEB', 'JHN', 22)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('404s chapters the provider does not have', async () => {
    await expect(controller.getChapter('WEB', 'JHN', 4)).rejects.toThrow(
      NotFoundException,
    );
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

describe('CachingScriptureProvider', () => {
  function countingProvider(): {
    provider: ScriptureProvider;
    calls: () => number;
  } {
    let calls = 0;
    return {
      calls: () => calls,
      provider: {
        listTranslations: () => {
          calls++;
          return Promise.resolve([]);
        },
        getChapter: (translationId, book, chapter) => {
          calls++;
          return Promise.resolve({ translationId, book, chapter, verses: [] });
        },
      },
    };
  }

  it('serves repeat chapter reads from cache', async () => {
    const { provider, calls } = countingProvider();
    const cached = new CachingScriptureProvider(provider);
    await cached.getChapter('WEB', 'JHN', 3);
    await cached.getChapter('WEB', 'JHN', 3);
    expect(calls()).toBe(1);
    await cached.getChapter('WEB', 'JHN', 4);
    expect(calls()).toBe(2);
  });

  it('expires entries after the TTL', async () => {
    const { provider, calls } = countingProvider();
    const cached = new CachingScriptureProvider(provider, -1); // already expired
    await cached.getChapter('WEB', 'JHN', 3);
    await cached.getChapter('WEB', 'JHN', 3);
    expect(calls()).toBe(2);
  });
});
