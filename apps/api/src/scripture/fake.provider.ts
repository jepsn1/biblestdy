import type { Chapter, Translation } from '@biblestdy/shared';
import { ChapterNotFoundError, type ScriptureProvider } from './provider';
import fixtures from './fixtures/web-chapters.json';

/** The fixture translations. WEB2 reserves the same text under a second id so
 * the translation switcher (#11) is exercisable without an API.Bible key —
 * anchors on WEB and WEB2 are distinct, like real translations. */
const FAKE_TRANSLATIONS: Translation[] = [
  {
    id: 'WEB',
    name: 'World English Bible (fixture)',
    abbreviation: 'WEB',
    language: 'en',
  },
  {
    id: 'WEB2',
    name: 'World English Bible alt (fixture)',
    abbreviation: 'WEB2',
    language: 'en',
  },
];

/**
 * Keyless dev/test provider serving a few real World English Bible
 * (public domain) chapters from fixtures.
 */
export class FakeScriptureProvider implements ScriptureProvider {
  private readonly chapters = new Map<string, Chapter>(
    Object.entries(fixtures as Record<string, Chapter>),
  );

  listTranslations(): Promise<Translation[]> {
    return Promise.resolve(FAKE_TRANSLATIONS);
  }

  getChapter(
    translationId: string,
    book: string,
    chapter: number,
  ): Promise<Chapter> {
    const found = FAKE_TRANSLATIONS.some((t) => t.id === translationId)
      ? this.chapters.get(`${book}.${chapter}`)
      : undefined;
    if (!found) throw new ChapterNotFoundError(translationId, book, chapter);
    return Promise.resolve({ ...found, translationId });
  }
}
