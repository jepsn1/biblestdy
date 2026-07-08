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
  ): Promise<Chapter>;
}

export const SCRIPTURE_PROVIDER = Symbol('SCRIPTURE_PROVIDER');

export class ChapterNotFoundError extends Error {
  constructor(translationId: string, book: string, chapter: number) {
    super(`No chapter ${book}.${chapter} in translation ${translationId}`);
    this.name = 'ChapterNotFoundError';
  }
}
