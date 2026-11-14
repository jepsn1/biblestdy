import { bookName, type Annotation, type Note } from "@biblestdy/shared";
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

const ann = (id: string, text: string, book: string, chapter: number, startVerse: number, translationId = "web"): Annotation => ({
  id,
  text,
  translationId,
  book,
  chapter,
  startVerse,
  startWord: 0,
  endVerse: startVerse,
  endWord: 2,
});
const annotations: Annotation[] = [
  ann("x1", "Born of water — baptism?", "JHN", 3, 5),
  ann("x2", "The Shepherd provides", "PSA", 23, 1, "kjv"),
  ann("x3", "Født af Ånden", "JHN", 3, 8),
];

function ctx(over: Partial<PaletteContext> = {}): PaletteContext {
  const locale = over.locale ?? "en";
  return {
    locale,
    bookName: (id) => bookName(id, locale),
    notes,
    annotations,
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
    here: { book: "JHN", chapter: 3 },
    translationId: "web",
    translationAbbr: (id) => id.toUpperCase(),
    labels: {
      goTo: (r) => `Go to ${r}`,
      emptyHint: "type a passage",
      morePassages: (n) => `+${n} more`,
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

  it("empty: recent (deduped, not the current chapter), then common actions", () => {
    expect(ids("")).toEqual(["recent:PSA/23", "action:dark", "action:shortcuts"]);
  });

  it("empty with no history: a hint on what to type", () => {
    expect(ids("", ctx({ recent: [] }))).toEqual(["empty-hint", "action:dark", "action:shortcuts"]);
  });

  it("a note on several passages shows and opens the one that matched", () => {
    const multi: Note = { id: "m", title: "Adoption", body: "", anchors: [anchor("ROM", 8, 15), anchor("GAL", 4, 5)] };
    const row = buildResults("gal 4", ctx({ notes: [multi] })).find((r) => r.id === "note:m");
    expect(row).toMatchObject({ href: "/read/GAL/4?note=m", detail: "Galatians 4:5 · +1 more" });
  });

  it("a book-name query still finds a topic of that name", () => {
    expect(ids("grace", ctx({ tags: [{ id: "g", name: "job" }] }))).not.toContain("topic:g");
    expect(ids("job", ctx({ tags: [{ id: "g", name: "job" }] }))).toContain("topic:g");
  });

  it("an untitled note shows its first words", () => {
    expect(buildResults("@grace", ctx())[0].label).toBe("Untitled thought about grace");
  });
});

describe("palette results: margin notes", () => {
  it("found by words: its text, the verse it's on, opening there", () => {
    const row = buildResults("baptism", ctx()).find((r) => r.group === "annotations");
    expect(row).toMatchObject({ id: "annotation:x1", label: "Born of water — baptism?", detail: "John 3:5", href: "/read/JHN/3?v=5" });
    expect(row?.translationId).toBeUndefined();
  });

  it("case- and accent-insensitive", () => {
    expect(ids("ANDEN")).toContain("annotation:x3");
    expect(ids("født")).toContain("annotation:x3");
  });

  it("in another version: names it and opens in it", () => {
    const row = buildResults("shepherd", ctx()).find((r) => r.id === "annotation:x2");
    expect(row).toMatchObject({ detail: "Psalms 23:1 · KJV", href: "/read/PSA/23?v=1", translationId: "kjv" });
  });

  it("a typed passage lists the margin notes on it, after notes", () => {
    expect(ids("john 3")).toEqual(["passage", "note:n2", "annotation:x1", "annotation:x3"]);
    expect(ids("john 3:5")).toEqual(["passage", "annotation:x1"]);
    expect(ids("john 3:6-8")).toEqual(["passage", "annotation:x3"]);
  });

  it("on a passage, this version's come first", () => {
    const c = ctx({ annotations: [ann("k", "kjv one", "JHN", 3, 1, "kjv"), ann("w", "web one", "JHN", 3, 9)] });
    expect(ids("john 3", c).filter((id) => id.startsWith("annotation"))).toEqual(["annotation:w", "annotation:k"]);
  });

  it("Danish reference format", () => {
    expect(buildResults("vand", ctx({ locale: "da", annotations: [ann("d", "vand og Ånd", "JHN", 3, 5)] }))[0]).toMatchObject({
      detail: "Johannes 3,5",
    });
  });

  it("@ narrows to notes and margin notes", () => {
    expect(ids("@shep")).toEqual(["annotation:x2"]);
    expect(buildResults("@born", ctx()).every((r) => r.group === "notes" || r.group === "annotations")).toBe(true);
  });

  it("a long one is clipped around the match", () => {
    const long = `${"word ".repeat(30)}needle ${"tail ".repeat(30)}`.trim();
    const row = buildResults("needle", ctx({ annotations: [ann("l", long, "ROM", 1, 1)] })).find((r) => r.id === "annotation:l");
    expect(row?.label.startsWith("…")).toBe(true);
    expect(row?.label.length).toBeLessThan(100);
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
