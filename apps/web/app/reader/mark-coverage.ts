import { type Anchor, type Chapter, words, wordRangeInVerse } from "@biblestdy/shared";

/** Words an anchor spans, for smallest-first ordering. */
export const spanSize = (a: Anchor) => (a.endVerse - a.startVerse) * 1000 + (a.endWord - a.startWord);

/** Give each word ("verse:word") to the first item covering it — callers
 * sort smallest first, so the most specific mark wins clicks + wash. A
 * larger mark can end up owning no word at all. */
export function coverInto<T>(
  map: Map<string, T>,
  verses: Chapter["verses"],
  items: (Anchor & { value: T })[],
) {
  for (const v of verses) {
    const count = words(v.text).length;
    for (const it of items) {
      const range = wordRangeInVerse(it, v.verse, count);
      if (!range) continue;
      for (let w = range.start; w <= range.end; w++) {
        const key = `${v.verse}:${w}`;
        if (!map.has(key)) map.set(key, it.value);
      }
    }
  }
}
