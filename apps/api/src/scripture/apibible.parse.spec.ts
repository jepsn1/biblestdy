import { words, type TextBlock, type Verse } from '@biblestdy/shared';
import { describe, expect, it } from 'vitest';
import { parseChapterContent } from './apibible.provider';
import bphJhn3 from './fixtures/apibible/bph-JHN.3.json';
import bphPsa23 from './fixtures/apibible/bph-PSA.23.json';
import nivJhn3 from './fixtures/apibible/niv-JHN.3.json';
import nivPsa23 from './fixtures/apibible/niv-PSA.23.json';
import nkjvJhn3 from './fixtures/apibible/nkjv-JHN.3.json';
import webJhn3 from './fixtures/apibible/web-JHN.3.json';
import webPsa23 from './fixtures/apibible/web-PSA.23.json';

// Real API.Bible content-type=json chapters (fetched 2026-11-13).
// BPH is closed-license: its fixtures keep the exact node structure and
// whitespace, but every word is replaced by "w".
type Content = Parameters<typeof parseChapterContent>[0];
const FIXTURES: Record<string, Content> = {
  'NIV JHN.3': nivJhn3.content,
  'NIV PSA.23': nivPsa23.content,
  'NKJV JHN.3': nkjvJhn3.content,
  'WEB JHN.3': webJhn3.content,
  'WEB PSA.23': webPsa23.content,
  'BPH JHN.3': bphJhn3.content,
  'BPH PSA.23': bphPsa23.content,
};

/**
 * FROZEN copy of the verse extraction shipped before #50. Existing
 * annotations' word offsets were computed against this output — the new
 * parser must reproduce it word for word (bridges aside, which were broken).
 */
function legacyVerses(content: Content): Verse[] {
  const HEADING = new Set(['s', 's1', 's2', 's3', 'ms', 'ms1', 'ms2']);
  const texts = new Map<number, string[]>();
  let current: number | undefined;
  const walk = (nodes: Content) => {
    for (const node of nodes) {
      if (node.name === 'para' && HEADING.has(node.attrs?.style ?? ''))
        continue;
      if (node.name === 'verse' && node.attrs?.number) {
        const parsed = Number(node.attrs.number);
        if (Number.isFinite(parsed)) current = parsed;
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
  return [...texts.entries()]
    .sort(([a], [b]) => a - b)
    .map(([verse, parts]) => ({
      verse,
      text: parts.join('').replace(/\s+/g, ' ').trim(),
    }))
    .filter((v) => v.text.length > 0);
}

/** Slice verse text into the lines/paragraphs the blocks describe. */
function linesOf(verses: Verse[], blocks: TextBlock[]): string[] {
  const lines: string[][] = [];
  let line: string[] = [];
  let bi = 0;
  for (const v of verses) {
    const ws = words(v.text);
    ws.forEach((w, i) => {
      let rest = w;
      while (
        bi < blocks.length &&
        blocks[bi].verse === v.verse &&
        blocks[bi].word === i
      ) {
        const cut = blocks[bi].char ?? 0;
        if (cut > 0) line.push(rest.slice(0, cut));
        if (line.length > 0) lines.push(line);
        line = [];
        rest = rest.slice(cut);
        bi++;
      }
      line.push(rest);
    });
  }
  if (line.length > 0) lines.push(line);
  return lines.map((l) => l.join(' '));
}

/** Source text of each layout paragraph from the first verse marker on. */
function sourceLines(content: Content): string[] {
  const hasVerse = (n: Content[number]): boolean =>
    n.name === 'verse' || (n.items ?? []).some(hasVerse);
  const text = (n: Content[number]): string =>
    n.name === 'verse'
      ? ''
      : (n.type === 'text' ? (n.text ?? '') : '') +
        (n.items ?? []).map(text).join('');
  const firstVerse = content.findIndex(hasVerse);
  return content
    .slice(firstVerse)
    .filter(
      (n) => n.name === 'para' && /^(p|m|q\d|d)$/.test(n.attrs?.style ?? ''),
    )
    .map((n) => text(n).replace(/\s+/g, ' ').trim())
    .filter((t) => t.length > 0);
}

describe('parseChapterContent on real API.Bible chapters', () => {
  for (const [name, content] of Object.entries(FIXTURES)) {
    it(`${name}: verse text + word split identical to the pre-#50 parser`, () => {
      const { verses } = parseChapterContent(content);
      const legacy = legacyVerses(content);
      const isBph = name.startsWith('BPH');
      // BPH JHN.3's bridge was mis-parsed before (into v13): compare the rest
      const skip = new Set(isBph && name.endsWith('JHN.3') ? [13, 14] : []);
      const strip = verses
        .filter((v) => !skip.has(v.verse))
        .map((v) => ({ verse: v.verse, text: v.text }));
      expect(strip).toEqual(legacy.filter((v) => !skip.has(v.verse)));
      for (const v of strip) {
        const old = legacy.find((l) => l.verse === v.verse)!;
        expect(words(v.text)).toEqual(words(old.text));
      }
    });

    it(`${name}: every block points at a real word`, () => {
      const { verses, blocks } = parseChapterContent(content);
      expect(blocks.length).toBeGreaterThan(0);
      for (const b of blocks) {
        const v = verses.find((x) => x.verse === b.verse);
        expect(v, JSON.stringify(b)).toBeDefined();
        const ws = words(v!.text);
        expect(b.word).toBeLessThan(ws.length);
        if (b.char !== undefined) {
          expect(b.char).toBeGreaterThan(0);
          expect(b.char).toBeLessThan(ws[b.word].length);
        }
      }
    });
  }

  it('BPH JHN.3: bridge 14-15 is one unit under 14, labelled, not in v13', () => {
    const { verses } = parseChapterContent(FIXTURES['BPH JHN.3']);
    const numbers = verses.map((v) => v.verse);
    expect(verses).toHaveLength(35); // 36 verses' worth: 14-15 is one unit
    expect(numbers).toEqual(
      Array.from({ length: 36 }, (_, i) => i + 1).filter((n) => n !== 15),
    );
    const bridge = verses.find((v) => v.verse === 14)!;
    expect(bridge.label).toBe('14–15');
    expect(verses.filter((v) => v.label)).toHaveLength(1);
    // Legacy appended the bridge to v13 (even fusing a word across the seam)
    const legacy13 = legacyVerses(FIXTURES['BPH JHN.3']).find(
      (v) => v.verse === 13,
    )!;
    const v13 = verses.find((v) => v.verse === 13)!;
    const squash = (t: string) => t.replace(/\s+/g, '');
    expect(squash(v13.text + bridge.text)).toBe(squash(legacy13.text));
  });

  it('NIV PSA.23: poetry lines, levels and the stanza break', () => {
    const { verses, blocks } = parseChapterContent(FIXTURES['NIV PSA.23']);
    expect(linesOf(verses, blocks)).toEqual(
      sourceLines(FIXTURES['NIV PSA.23']),
    );
    expect(blocks.every((b) => b.kind === 'poetry')).toBe(true);
    expect(blocks.slice(0, 3).map((b) => b.level)).toEqual([1, 2, 1]);
    // "he leads me" runs into "pastures," in the source (no space): the
    // break sits inside the joined word, which stays one anchorable word
    expect(blocks[2]).toEqual({
      verse: 2,
      word: 7,
      char: 'pastures,'.length,
      kind: 'poetry',
      level: 1,
    });
    expect(words(verses[1].text)[7]).toBe('pastures,he');
    expect(blocks.filter((b) => b.stanza)).toEqual([
      { verse: 5, word: 0, kind: 'poetry', level: 1, stanza: true },
    ]);
  });

  it('WEB PSA.23 + BPH PSA.23: line slices reproduce the source lines', () => {
    for (const name of ['WEB PSA.23', 'BPH PSA.23']) {
      const { verses, blocks } = parseChapterContent(FIXTURES[name]);
      expect(linesOf(verses, blocks)).toEqual(sourceLines(FIXTURES[name]));
    }
  });

  it('prose: one block per source paragraph (WEB/NIV/NKJV/BPH JHN.3)', () => {
    for (const name of ['WEB JHN.3', 'NIV JHN.3', 'NKJV JHN.3', 'BPH JHN.3']) {
      const { verses, blocks } = parseChapterContent(FIXTURES[name]);
      expect(linesOf(verses, blocks), name).toEqual(
        sourceLines(FIXTURES[name]),
      );
    }
    const bph = parseChapterContent(FIXTURES['BPH JHN.3']).blocks;
    expect(bph[0]).toEqual({ verse: 1, word: 0, kind: 'flush' }); // USFM m
    expect(bph.some((b) => b.kind === 'paragraph')).toBe(true);
  });
});

describe('parseChapterContent: bridges + blocks (synthetic)', () => {
  it('a paragraph break mid-verse is placed by word index, text unchanged', () => {
    const { verses, blocks } = parseChapterContent([
      {
        name: 'para',
        attrs: { style: 'p' },
        items: [
          { name: 'verse', attrs: { number: '1' } },
          { type: 'text', text: 'One two three. ' },
        ],
      },
      {
        name: 'para',
        attrs: { style: 'p' },
        items: [{ type: 'text', text: 'Four five.' }],
      },
    ]);
    expect(verses).toEqual([{ verse: 1, text: 'One two three. Four five.' }]);
    expect(blocks).toEqual([
      { verse: 1, word: 0, kind: 'paragraph' },
      { verse: 1, word: 3, kind: 'paragraph' },
    ]);
  });

  it('bridge markers with an en dash parse too; unknown markers still ignored', () => {
    const { verses } = parseChapterContent([
      { name: 'verse', attrs: { number: '1' } },
      { type: 'text', text: 'First.' },
      { name: 'verse', attrs: { number: '2–4' } },
      { type: 'text', text: 'Bridged.' },
      { name: 'verse', attrs: { number: 'x' } },
      { type: 'text', text: 'Still bridged.' },
    ]);
    expect(verses).toEqual([
      { verse: 1, text: 'First.' },
      { verse: 2, label: '2–4', text: 'Bridged.Still bridged.' },
    ]);
  });
});
