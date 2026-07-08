import type { Chapter, Translation } from '@biblestdy/shared';
import type { ScriptureProvider } from './provider';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_CHAPTERS = 500;

/**
 * In-memory TTL cache decorator. Scripture text is effectively static, so a
 * long TTL both speeds reads and keeps us inside API.Bible call quotas.
 */
export class CachingScriptureProvider implements ScriptureProvider {
  private translations?: { value: Translation[]; expires: number };
  private readonly chapters = new Map<
    string,
    { value: Chapter; expires: number }
  >();

  constructor(
    private readonly inner: ScriptureProvider,
    private readonly ttlMs = DAY_MS,
  ) {}

  async listTranslations(): Promise<Translation[]> {
    if (this.translations && this.translations.expires > Date.now()) {
      return this.translations.value;
    }
    const value = await this.inner.listTranslations();
    this.translations = { value, expires: Date.now() + this.ttlMs };
    return value;
  }

  async getChapter(
    translationId: string,
    book: string,
    chapter: number,
  ): Promise<Chapter> {
    const key = `${translationId}/${book}.${chapter}`;
    const hit = this.chapters.get(key);
    if (hit && hit.expires > Date.now()) return hit.value;

    const value = await this.inner.getChapter(translationId, book, chapter);
    if (this.chapters.size >= MAX_CHAPTERS) {
      // Drop the oldest entry; plenty for a pilot-scale cache
      const [oldest] = this.chapters.keys();
      if (oldest !== undefined) this.chapters.delete(oldest);
    }
    this.chapters.set(key, { value, expires: Date.now() + this.ttlMs });
    return value;
  }
}
