import { useEffect } from "react";
import { MAX_COPY_VERSES } from "~/reader/copy-attribution";

/**
 * Printing is limited to 100 verses (API.Bible ToS §12). Just before the
 * browser prints, count the verses on the page (every Scripture block:
 * the chapter and what runs on from the next); over the limit, the print
 * leaves the text out and says why (app.css `[data-print-limited]`).
 */
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
    const html = document.documentElement;
    const before = () => html.toggleAttribute("data-print-limited", shownVerseCount() > MAX_COPY_VERSES);
    const after = () => html.removeAttribute("data-print-limited");
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);
}
