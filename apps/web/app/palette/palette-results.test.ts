import { bookName, type Note } from "@biblestdy/shared";
import { describe, expect, it } from "vitest";
import { buildResults, plainText, wordPrefixMatch, type PaletteContext } from "./palette-results";

const anchor = (book: string, chapter: number, startVerse: number, endVerse = startVerse) => ({
  id: `a-${book}${chapter}${startVerse}`,
  translationId: "web",
  book,
  chapter,
  startVerse,
  startWord: 0,
  endVerse,
  endWord: 3,
});
const notes: Note[] = [
  { id: "n1", title: "Adoption", body: "We are **children** of God.", anchors: [anchor("ROM", 8, 14, 17)] },
  { id: "n2", title: "Bronze serpent", body: "Compare Numbers 21 — looking up is believing in adoption.", anchors: [anchor("JHN", 3, 14)] },
  { id: "n3", title: "", body: "Untitled thought about grace", anchors: [anchor("ROM", 8, 28)] },
];

function ctx(over: Partial<PaletteContext> = {}): PaletteContext {
  const locale = over.locale ?? "en";
  return {
    locale,
    bookName: (id) => bookName(id, locale),
    notes,
    tags: [
      { id: "t1", name: "new-birth" },
      { id: "t2", name: "grace" },
    ],
    actions: [
      { id: "dark", label: "Switch to dark", keywords: ["mørk", "theme", "tema"], common: true },
      { id: "read-NKJV", label: "Read in NKJV", keywords: ["New King James", "translation", "oversættelse"] },
      { id: "shortcuts", label: "Keyboard shortcuts", keywords: ["tastatur", "genveje"], shortcut: "?", common: true },
    ],
    recent: [
      { book: "JHN", chapter: 3 },
      { book: "PSA", chapter: 23 },
      { book: "PSA", chapter: 23 },
    ],
    lastRead: "ROM/8?p=2",
    here: { book: "JHN", chapter: 3 },
    labels: {
      goTo: (r) => `Go to ${r}`,
      continueAt: (r) => `Continue: ${r}`,
      invalid: "invalid",
      noTextSearch: "no text search",
      untitled: "Untitled",
    },
    ...over,
  };
}

const ids = (input: string, c = ctx()) => buildResults(input, c).map((i) => i.id);

describe("palette results", () => {
  it("a typed reference is the first row and links to the verse", () => {
    const [first] = buildResults("rom 8:28", ctx());
    expect(first).toMatchObject({ group: "passage", label: "Go to Romans 8:28", href: "/read/ROM/8?v=28" });
  });

  it("Danish: 'Joh 3,16' parses and is labelled in Danish", () => {
    const [first] = buildResults("Joh 3,16", ctx({ locale: "da" }));
    expect(first.label).toBe("Go to Johannes 3,16");
  });

  it("a reference also lists your notes on that passage", () => {
    expect(ids("rom 8:28")).toEqual(["passage", "note:n3"]);
    expect(ids("rom 8")).toEqual(["passage", "note:n1", "note:n3"]);
  });

  it("a book name offers books (Tab completes, Enter = chapter 1)", () => {
    const rows = buildResults("joh", ctx());
    const john = rows.find((r) => r.id === "book:JHN");
    expect(john).toMatchObject({ href: "/read/JHN/1", complete: "John " });
  });

  it("an impossible reference says so instead of navigating", () => {
    expect(buildResults("rom 99", ctx())[0]).toMatchObject({ id: "invalid", disabled: true });
  });

  it("actions match in both languages", () => {
    expect(ids("mørk")).toContain("action:dark");
    expect(ids("dark")).toContain("action:dark");
    expect(ids("new king")).toContain("action:read-NKJV");
  });

  it("note search: title hits before body hits, markdown stripped", () => {
    const rows = buildResults("adoption", ctx()).filter((r) => r.group === "notes");
    expect(rows.map((r) => r.id)).toEqual(["note:n1", "note:n2"]);
    expect(rows[1].detail).toContain("adoption");
    expect(buildResults("children", ctx()).find((r) => r.id === "note:n1")).toBeTruthy();
  });

  it("prefixes narrow to one group", () => {
    expect(buildResults(">", ctx()).every((r) => r.group === "actions")).toBe(true);
    expect(ids("#gr")).toEqual(["topic:t2"]);
    expect(ids("@grace")).toEqual(["note:n3"]);
  });

  it("topics link to their page", () => {
    expect(buildResults("new", ctx()).find((r) => r.id === "topic:t1")?.href).toBe("/topic/new-birth");
  });

  it("nothing found: says Bible text search isn't there yet", () => {
    expect(buildResults("love is patient", ctx())).toEqual([
      expect.objectContaining({ id: "none", disabled: true, label: "no text search" }),
    ]);
  });

  it("empty: continue reading, recent (deduped, not the current chapter), common actions", () => {
    expect(ids("")).toEqual(["continue", "recent:PSA/23", "action:dark", "action:shortcuts"]);
    expect(buildResults("", ctx())[0]).toMatchObject({ label: "Continue: Romans 8", href: "/read/ROM/8?p=2" });
  });

  it("an untitled note shows its first words", () => {
    expect(buildResults("@grace", ctx())[0].label).toBe("Untitled thought about grace");
  });
});

describe("helpers", () => {
  it("wordPrefixMatch needs every word to start a word", () => {
    expect(wordPrefixMatch("Switch to dark", "sw da")).toBe(true);
    expect(wordPrefixMatch("Promise from God", "rom")).toBe(false);
  });
  it("plainText drops markdown", () => {
    expect(plainText("**bold** [link](http://x) `code`")).toBe("bold link code");
  });
});
