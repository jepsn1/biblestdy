import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { collectVerses } from './apibible.provider';
import { CachingScriptureProvider } from './caching.provider';
import { FakeScriptureProvider } from './fake.provider';
import type { ScriptureProvider } from './provider';
import { ScriptureController } from './scripture.controller';

describe('ScriptureController (with fake provider)', () => {
  const controller = new ScriptureController(new FakeScriptureProvider());

  it('lists translations', async () => {
    const translations = await controller.listTranslations();
    expect(translations).toHaveLength(1);
    expect(translations[0]).toMatchObject({ id: 'WEB', language: 'en' });
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

describe('collectVerses (API.Bible json content)', () => {
  it('flattens verse tags + text nodes into ordered verses', () => {
    const verses = collectVerses([
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

  it('ignores text before any verse marker and empty verses', () => {
    const verses = collectVerses([
      { type: 'text', text: 'Chapter heading noise' },
      { type: 'tag', name: 'verse', attrs: { number: '1' } },
      { type: 'text', text: '  Real text  ' },
    ]);
    expect(verses).toEqual([{ verse: 1, text: 'Real text' }]);
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
