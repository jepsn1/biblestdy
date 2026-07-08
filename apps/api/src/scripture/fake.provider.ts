import type { Chapter, Translation } from '@biblestdy/shared';
import { ChapterNotFoundError, type ScriptureProvider } from './provider';
import fixtures from './fixtures/web-chapters.json';

/**
 * Keyless dev/test provider serving a few real World English Bible
 * (public domain) chapters from fixtures.
 */
export class FakeScriptureProvider implements ScriptureProvider {
  private readonly chapters = new Map<string, Chapter>(
    Object.entries(fixtures as Record<string, Chapter>),
  );

  listTranslations(): Promise<Translation[]> {
    return Promise.resolve([
      {
        id: 'WEB',
        name: 'World English Bible (fixture)',
        abbreviation: 'WEB',
        language: 'en',
      },
    ]);
  }

  getChapter(
    translationId: string,
    book: string,
    chapter: number,
  ): Promise<Chapter> {
    const found =
      translationId === 'WEB'
        ? this.chapters.get(`${book}.${chapter}`)
        : undefined;
    if (!found) throw new ChapterNotFoundError(translationId, book, chapter);
    return Promise.resolve(found);
  }
}
