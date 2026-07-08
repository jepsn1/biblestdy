import type { Chapter, Translation, Verse } from '@biblestdy/shared';
import { ChapterNotFoundError, type ScriptureProvider } from './provider';

const BASE_URL = 'https://api.scripture.api.bible/v1';
/** Languages surfaced to the app (ISO 639-3 as used by API.Bible). */
const LANGUAGES = new Set(['eng', 'dan']);

interface ApiBibleSummary {
  id: string;
  name: string;
  abbreviationLocal: string;
  language: { id: string };
}

/** One node of API.Bible's content-type=json chapter content. */
interface ContentNode {
  type?: string;
  name?: string;
  text?: string;
  attrs?: { number?: string; verseId?: string };
  items?: ContentNode[];
}

interface ApiBibleChapter {
  content: ContentNode[];
  copyright?: string;
}

export class ApiBibleProvider implements ScriptureProvider {
  constructor(private readonly apiKey: string) {}

  async listTranslations(): Promise<Translation[]> {
    const data = await this.get<ApiBibleSummary[]>('/bibles');
    return data
      .filter((b) => LANGUAGES.has(b.language.id))
      .map((b) => ({
        id: b.id,
        name: b.name,
        abbreviation: b.abbreviationLocal,
        language: b.language.id === 'dan' ? 'da' : 'en',
      }));
  }

  async getChapter(
    translationId: string,
    book: string,
    chapter: number,
  ): Promise<Chapter> {
    let data: ApiBibleChapter;
    try {
      data = await this.get<ApiBibleChapter>(
        `/bibles/${translationId}/chapters/${book}.${chapter}?content-type=json&include-notes=false&include-titles=false`,
      );
    } catch (err) {
      if (err instanceof HttpStatusError && err.status === 404) {
        throw new ChapterNotFoundError(translationId, book, chapter);
      }
      throw err;
    }
    return {
      translationId,
      book,
      chapter,
      verses: collectVerses(data.content),
      copyright: data.copyright?.trim() || undefined,
    };
  }

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: { 'api-key': this.apiKey },
    });
    if (!res.ok) throw new HttpStatusError(res.status, path);
    const body = (await res.json()) as { data: T };
    return body.data;
  }
}

class HttpStatusError extends Error {
  constructor(
    readonly status: number,
    path: string,
  ) {
    super(`API.Bible responded ${status} for ${path}`);
  }
}

/**
 * Flatten API.Bible JSON content into verses: 'verse' tags open a verse,
 * text nodes accumulate into whichever verse is open.
 */
export function collectVerses(content: ContentNode[]): Verse[] {
  const texts = new Map<number, string[]>();
  let current: number | undefined;

  const walk = (nodes: ContentNode[]) => {
    for (const node of nodes) {
      if (node.name === 'verse' && node.attrs?.number) {
        const parsed = Number(node.attrs.number);
        if (Number.isFinite(parsed)) current = parsed;
      } else if (node.type === 'text' && node.text) {
        if (current !== undefined) {
          const parts = texts.get(current) ?? [];
          parts.push(node.text);
          texts.set(current, parts);
        }
      }
      if (node.items) walk(node.items);
    }
  };
  walk(content);

  return [...texts.entries()]
    .sort(([a], [b]) => a - b)
    .map(([verse, parts]) => ({
      verse,
      text: parts.join('').replace(/\s+/g, ' ').trim(),
    }))
    .filter((v) => v.text.length > 0);
}
