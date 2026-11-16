import type { Chapter, Translation } from '@biblestdy/shared';
import type { ScriptureProvider } from './provider';

const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * Hard ceiling on how old served text may be. API.Bible ToS §11: cached
 * content must be checked at least every 30 days and shown no more than 30
 * days out of date — 25 days leaves margin. The default TTL (24 h) also
 * carries any change from API.Bible or a rights holder within a day.
 */
export const MAX_AGE_MS = 25 * DAY_MS;
const MAX_CHAPTERS = 500;

/**
 * In-memory TTL cache decorator. Scripture text is effectively static, so a
 * long TTL both speeds reads and keeps us inside API.Bible call quotas. A
 * chapter is cached with its FUMS token, so a view served from here still
 * reports to API.Bible. `purge` drops one translation (or all) on request
 * (ToS §10/§11: removals within 72 h, changes within 24 h).
 */
export class CachingScriptureProvider implements ScriptureProvider {
  private translations?: { value: Translation[]; expires: number };
  private readonly chapters = new Map<
    string,
    { value: Chapter; expires: number }
  >();
  private readonly ttlMs: number;

  constructor(
    private readonly inner: ScriptureProvider,
    ttlMs = DAY_MS,
    private readonly now: () => number = Date.now,
  ) {
    this.ttlMs = Math.min(ttlMs, MAX_AGE_MS);
  }

  async listTranslations(): Promise<Translation[]> {
    if (this.translations && this.translations.expires > this.now()) {
      return this.translations.value;
    }
    const value = await this.inner.listTranslations();
    this.translations = { value, expires: this.now() + this.ttlMs };
    return value;
  }

  async getChapter(
    translationId: string,
    book: string,
    chapter: number,
  ): Promise<Chapter> {
    const key = `${translationId}/${book}.${chapter}`;
    const hit = this.chapters.get(key);
    if (hit && hit.expires > this.now()) return hit.value;

    const value = await this.inner.getChapter(translationId, book, chapter);
    if (this.chapters.size >= MAX_CHAPTERS) {
      // Drop the oldest entry; plenty for a pilot-scale cache
      const [oldest] = this.chapters.keys();
      if (oldest !== undefined) this.chapters.delete(oldest);
    }
    this.chapters.set(key, { value, expires: this.now() + this.ttlMs });
    return value;
  }

  /** Drop cached chapters of one translation (no id: everything, the
   * translation list too). Returns how many chapters were dropped. */
  purge(translationId?: string): number {
    let dropped = 0;
    for (const key of [...this.chapters.keys()]) {
      if (translationId === undefined || key.startsWith(`${translationId}/`)) {
        this.chapters.delete(key);
        dropped++;
      }
    }
    // The list carries copyright lines: refetch it either way
    this.translations = undefined;
    return dropped;
  }
}
