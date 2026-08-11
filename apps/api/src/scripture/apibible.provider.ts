import type { Chapter, Section, Translation, Verse } from '@biblestdy/shared';
import { ChapterNotFoundError, type ScriptureProvider } from './provider';

const BASE_URL = 'https://api.scripture.api.bible/v1';
/** Languages surfaced to the app (ISO 639-3 as used by API.Bible). */
const LANGUAGES = new Set(['eng', 'dan']);
/** Curated picks, in picker order (first = default). The key serves ~250
 * bibles — without this the picker drowns. Danish absent from API.Bible's
 * public catalog (BPH is closed-license; Bibelen 2020 pending Bibelselskabet
 * license → DBL) — the language filter below keeps the door open. */
const CURATED = [
  '78a9f6124f344018-01', // NIV 2011
  '9879dbb7cfe39e4d-01', // World English Bible
  '63097d2a0a2f7db3-01', // New King James Version
];

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
  attrs?: { number?: string; verseId?: string; style?: string };
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
    const eligible = data.filter((b) => LANGUAGES.has(b.language.id));
    const curated = CURATED.map((id) =>
      eligible.find((b) => b.id === id),
    ).filter((b) => b !== undefined);
    // Any Danish bible that ever lands on the key surfaces automatically
    const danish = eligible.filter(
      (b) => b.language.id === 'dan' && !CURATED.includes(b.id),
    );
    return [...curated, ...danish].map((b) => ({
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
        `/bibles/${translationId}/chapters/${book}.${chapter}?content-type=json&include-notes=false&include-titles=true`,
      );
    } catch (err) {
      if (err instanceof HttpStatusError && err.status === 404) {
        throw new ChapterNotFoundError(translationId, book, chapter);
      }
      throw err;
    }
    const { verses, sections } = parseChapterContent(data.content);
    return {
      translationId,
      book,
      chapter,
      verses,
      sections: sections.length > 0 ? sections : undefined,
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

/** USFM paragraph styles that carry editorial section headings. */
const HEADING_STYLES = new Set(['s', 's1', 's2', 's3', 'ms', 'ms1', 'ms2']);

/**
 * Flatten API.Bible JSON content: 'verse' tags open a verse and text nodes
 * accumulate into it; heading paragraphs (USFM s/ms styles) become sections
 * attached to the NEXT verse — kept apart from verse text so annotations can
 * never anchor to editorial titles.
 */
export function parseChapterContent(content: ContentNode[]): {
  verses: Verse[];
  sections: Section[];
} {
  const texts = new Map<number, string[]>();
  const sections: Section[] = [];
  const pendingTitles: string[] = [];
  let current: number | undefined;

  const walk = (nodes: ContentNode[]) => {
    for (const node of nodes) {
      if (node.name === 'para' && HEADING_STYLES.has(node.attrs?.style ?? '')) {
        const title = collectText(node).replace(/\s+/g, ' ').trim();
        if (title) pendingTitles.push(title);
        continue; // never mix heading text into verse flow
      }
      if (node.name === 'verse' && node.attrs?.number) {
        const parsed = Number(node.attrs.number);
        if (Number.isFinite(parsed)) {
          current = parsed;
          while (pendingTitles.length > 0) {
            sections.push({
              beforeVerse: parsed,
              title: pendingTitles.shift()!,
            });
          }
        }
        // The marker's children are its printed label ("16") — never verse
        // text; letting it through corrupts word-offset anchors.
        continue;
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

  const verses = [...texts.entries()]
    .sort(([a], [b]) => a - b)
    .map(([verse, parts]) => ({
      verse,
      text: parts.join('').replace(/\s+/g, ' ').trim(),
    }))
    .filter((v) => v.text.length > 0);

  return { verses, sections };
}

function collectText(node: ContentNode): string {
  const own = node.type === 'text' && node.text ? node.text : '';
  return own + (node.items ?? []).map(collectText).join('');
}
