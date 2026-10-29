import type { Anchor, Chapter } from "@biblestdy/shared";
import { describe, expect, it } from "vitest";
import { formatCopy } from "./copy-attribution";

const john3: Chapter = {
  translationId: "web",
  book: "JHN",
  chapter: 3,
  verses: [
    { verse: 16, text: "For God so loved the world," },
    { verse: 17, text: "For God didn't send his Son" },
    { verse: 18, text: "He who believes in him is not judged." },
  ],
};

const anchor = (startVerse: number, startWord: number, endVerse: number, endWord: number): Anchor => ({
  translationId: "web",
  book: "JHN",
  chapter: 3,
  startVerse,
  startWord,
  endVerse,
  endWord,
});

describe("formatCopy", () => {
  it("single verse, public domain: selected text then reference + abbreviation only", () => {
    const { text } = formatCopy(john3, anchor(16, 0, 16, 5), "WEB");
    expect(text).toBe("For God so loved the world,\nJohn 3:16 (WEB)");
  });

  it("verse range: words across verses, reference shows the range", () => {
    const { text } = formatCopy(john3, anchor(16, 3, 18, 2), "WEB");
    expect(text).toBe(
      "loved the world, For God didn't send his Son He who believes\nJohn 3:16-18 (WEB)",
    );
  });

  it("licensed translation: copyright line follows the reference", () => {
    const niv = { ...john3, copyright: "Scripture quotations taken from the NIV®." };
    const { text } = formatCopy(niv, anchor(17, 0, 17, 5), "NIV");
    expect(text).toBe(
      "For God didn't send his Son\nJohn 3:17 (NIV)\nScripture quotations taken from the NIV®.",
    );
  });

  it("html: same lines with <br> breaks, text escaped", () => {
    const chapter = { ...john3, copyright: "© 2011 Biblica <www.biblica.com> & co" };
    const { html } = formatCopy(chapter, anchor(16, 0, 16, 1), "NIV");
    expect(html).toBe(
      "For God<br>John 3:16 (NIV)<br>© 2011 Biblica &lt;www.biblica.com&gt; &amp; co",
    );
  });
});
