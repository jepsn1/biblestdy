import type { Chapter, Translation } from '@biblestdy/shared';

/**
 * The seam between biblestdy and wherever Scripture text comes from.
 * API text is displayed/cached, never our system of record — implementations
 * must be swappable (API.Bible today, self-hosted text later) without
 * touching callers.
 */
export interface ScriptureProvider {
  listTranslations(): Promise<Translation[]>;
  getChapter(
    translationId: string,
    book: string,
    chapter: number,
    opts?: ChapterOptions,
  ): Promise<Chapter>;
}

export interface ChapterOptions {
  /** The reader's read-ahead (#248): a cache may decline to go upstream for
   * it when the API.Bible call budget is tight. */
  lowPriority?: boolean;
}

export const SCRIPTURE_PROVIDER = Symbol('SCRIPTURE_PROVIDER');

export class ChapterNotFoundError extends Error {
  constructor(translationId: string, book: string, chapter: number) {
    super(`No chapter ${book}.${chapter} in translation ${translationId}`);
    this.name = 'ChapterNotFoundError';
  }
}
