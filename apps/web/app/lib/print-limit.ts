import { useEffect } from "react";
import { MAX_COPY_VERSES } from "./licence-limits";

/**
 * Printing is limited to 100 verses (API.Bible ToS §12). Over the limit,
 * the print leaves the Scripture out and says why (app.css
 * `[data-print-limited]`). Kept true at all times, not only on
 * `beforeprint` (iOS share-sheet print and some webviews never fire it):
 * every Scripture block registers how many verses it shows (`showVerses`);
 * `beforeprint` re-checks against the DOM as a second line.
 */
const shown = new Map<symbol, number>();

function sync(extra = 0) {
  if (typeof document === "undefined") return;
  let total = 0;
  for (const n of shown.values()) total += n;
  document.documentElement.toggleAttribute("data-print-limited", Math.max(total, extra) > MAX_COPY_VERSES);
}

/** A Scripture block now shows `count` verses; returns its unregister. */
export function showVerses(count: number): () => void {
  const id = Symbol();
  shown.set(id, count);
  sync();
  return () => {
    shown.delete(id);
    sync();
  };
}

/** Verses on the page, counted in the DOM: distinct per Scripture block
 * (the chapter and what runs on from the next). */
export function shownVerseCount(doc: Pick<ParentNode, "querySelectorAll"> = document): number {
  let count = 0;
  for (const root of doc.querySelectorAll("[data-scripture]")) {
    const verses = new Set<string>();
    for (const el of root.querySelectorAll<HTMLElement>("[data-verse]")) {
      if (el.dataset.verse) verses.add(el.dataset.verse);
    }
    count += verses.size;
  }
  return count;
}

export function usePrintLimit() {
  useEffect(() => {
    const before = () => sync(shownVerseCount());
    const after = () => sync();
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);
}
