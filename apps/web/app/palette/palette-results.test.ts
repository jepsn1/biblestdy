import { bookName, type Annotation, type Highlight, type Note } from "@biblestdy/shared";
import { describe, expect, it } from "vitest";
import { buildResults, matchRanges, plainText, wordPrefixMatch, type PaletteContext } from "./palette-results";

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
const T = "2026-11-01T00:00:00.000Z";
const notes: Note[] = [
  { id: "n1", title: "Adoption", body: "We are **children** of God.", anchors: [anchor("ROM", 8, 14, 17)], updatedAt: T },
  { id: "n2", title: "Bronze serpent", body: "Compare Numbers 21 — looking up is believing in adoption.", anchors: [anchor("JHN", 3, 14)], updatedAt: T },
  { id: "n3", title: "", body: "Untitled thought about grace", anchors: [anchor("ROM", 8, 28)], updatedAt: T },
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
const hl = (id: string, quote: string | null, book: string, chapter: number, startVerse: number, translationId = "web"): Highlight => ({
  id,
  quote,
  color: "green",
  translationId,
  book,
  chapter,
  startVerse,
  startWord: 0,
  endVerse: startVerse,
  endWord: 4,
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
    highlights: [],
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
    colorLabel: () => undefined,
    colorWords: (c) => [c, { green: "grøn", blue: "blå" }[c as string] ?? c],
    labels: {
      closest: "Closest match",
      morePassages: (n) => `+${n} more`,
      invalid: "invalid",
      noMatches: (q) => `No matches for ${q}`,
      noTextSearch: "no text search",
      focusColor: (name) => `Focus on ${name}`,
      colorDetail: (n) => `${n} highlights`,
      untitled: "Untitled",
      mark: "Mark",
    },
    ...over,
  };
}

const ids = (input: string, c = ctx()) => buildResults(input, c).map((i) => i.id);

describe("palette results", () => {
  it("a typed reference is the first row and links to the verse", () => {
    const [first] = buildResults("rom 8:28", ctx());
    expect(first).toMatchObject({ group: "passage", label: "Romans 8:28", href: "/read/ROM/8?v=28", complete: "Romans 8:28" });
  });

  it("Danish: 'Joh 3,16' parses and is labelled in Danish", () => {
    const [first] = buildResults("Joh 3,16", ctx({ locale: "da" }));
    expect(first.label).toBe("Johannes 3,16");
  });

  it("writes passages as the reader's language does (one formatter, #130)", () => {
    const da = ctx({ locale: "da" });
    // One psalm is "Salme 23", whatever was typed — never "Psalm 23"
    for (const q of ["sl 23", "salme 23", "psalm 23"]) {
      expect(buildResults(q, da)[0]).toMatchObject({ label: "Salme 23", complete: "Salme 23" });
    }
    expect(buildResults("joh 3 16-18", da)[0].label).toBe("Johannes 3,16–18");
    expect(buildResults("1 kor 13", da)[0].label).toBe("1 Korintherbrev 13");
    expect(buildResults("ps 23", ctx())[0].label).toBe("Psalm 23");
    // A mark's place too, and recently read
    const marks = buildResults("Shepherd", da).find((r) => r.id === "annotation:x2");
    expect(marks?.detail).toBe("Salme 23,1 · KJV");
    const recent = buildResults("", ctx({ locale: "da", recent: [{ book: "PSA", chapter: 23 }] })).find((r) => r.group === "recent");
    expect(recent?.label).toBe("Salme 23");
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

  it("topics open the Notes page filtered by them", () => {
    expect(buildResults("new", ctx()).find((r) => r.id === "topic:t1")?.href).toBe("/notes?topic=new-birth");
  });

  it("a note without passages opens on the Notes page", () => {
    const draft: Note = { id: "d", title: "Sermon draft", body: "", anchors: [], updatedAt: T };
    expect(buildResults("sermon draft", ctx({ notes: [draft] })).find((r) => r.id === "note:d")?.href).toBe("/notes/d");
  });

  it("nothing found: says so, and that Bible text search isn't there yet", () => {
    expect(buildResults("love is patient", ctx())).toEqual([
      expect.objectContaining({ id: "none", disabled: true, label: "No matches for love is patient", detail: "no text search" }),
    ]);
  });

  it("empty: common commands first, then recent (deduped, not the current chapter)", () => {
    expect(ids("")).toEqual(["action:dark", "action:shortcuts", "recent:PSA/23"]);
  });

  it("empty with no history: just the commands", () => {
    expect(ids("", ctx({ recent: [] }))).toEqual(["action:dark", "action:shortcuts"]);
  });

  it("searching: commands come after your study", () => {
    const c = ctx({ notes: [{ id: "d", title: "Darkness and light", body: "", anchors: [anchor("JHN", 1, 5)], updatedAt: T }] });
    expect(ids("dark", c)).toEqual(["note:d", "action:dark"]);
  });

  it("rows carry the typed words to bold; a passage its letters and numbers apart", () => {
    expect(buildResults("adop", ctx()).find((r) => r.id === "note:n1")?.match).toBe("adop");
    expect(buildResults("joh", ctx()).find((r) => r.id === "book:JHN")?.match).toBe("joh");
    expect(buildResults("mørk", ctx()).find((r) => r.id === "action:dark")?.match).toBe("mørk");
    expect(buildResults("j3", ctx())[0]).toMatchObject({ label: "John 3", match: "j 3" });
    // Your study on that passage isn't bolded by the reference
    expect(buildResults("rom 8", ctx()).slice(1).every((r) => !r.match)).toBe(true);
  });

  it("a note on several passages shows and opens the one that matched", () => {
    const multi: Note = { id: "m", title: "Adoption", body: "", anchors: [anchor("ROM", 8, 15), anchor("GAL", 4, 5)], updatedAt: T };
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

describe("palette results: passages", () => {
  const passages = (input: string, c = ctx()) => buildResults(input, c).filter((r) => r.group === "passage").map((r) => r.label);

  it("'j3': several J books' chapter 3, John first; notes on John 3 follow", () => {
    const rows = passages("j3");
    expect(rows[0]).toBe("John 3");
    expect(rows.length).toBeGreaterThan(2);
    expect(ids("j3")).toContain("note:n2");
  });

  it.each([
    ["joh 3", "John 3"],
    ["jn3:16", "John 3:16"],
    ["john 3 16", "John 3:16"],
    ["3:16 john", "John 3:16"],
    ["1jn 4", "1 John 4"],
    ["first john 4", "1 John 4"],
    ["john 3:16–4:2", "John 3:16–4:2"],
  ])("%s → %s", (input, label) => {
    expect(passages(input)).toEqual([label]);
  });

  it("Danish UI: Danish names and separators", () => {
    const da = ctx({ locale: "da" });
    expect(passages("sl 23", da)).toEqual(["Salme 23"]);
    expect(passages("Åb 21,4", da)).toEqual(["Åbenbaringen 21,4"]);
    expect(passages("1 mos 1", da)).toEqual(["1 Mosebog 1"]);
  });

  it("'3 john': the book first, then John 3", () => {
    const rows = buildResults("3 john", ctx());
    expect(rows[0]).toMatchObject({ id: "book:3JN", group: "books" });
    expect(rows.find((r) => r.group === "passage")).toMatchObject({ label: "John 3", href: "/read/JHN/3" });
    expect(ids("3 john 1")[0]).toBe("passage");
    expect(passages("3 john 1")).toEqual(["3 John 1"]);
  });

  it("a typo: the guess says so, and your words are still searched", () => {
    const c = ctx({ notes: [{ id: "j", title: "jonh 3 notes", body: "", anchors: [anchor("ROM", 1, 1)], updatedAt: T }] });
    const rows = buildResults("jonh 3", c);
    expect(rows[0]).toMatchObject({ label: "John 3", detail: "Closest match" });
    expect(rows.map((r) => r.id)).toContain("note:j");
    // Not scoped to John 3 (a guess): its notes don't show
    expect(rows.map((r) => r.id)).not.toContain("note:n2");
  });

  it("books: worded ordinals and misspelt names", () => {
    expect(ids("first john")[0]).toBe("book:1JN");
    expect(ids("phillipians")[0]).toBe("book:PHP");
    expect(buildResults("phillipians", ctx())[0]).toMatchObject({ label: "Philippians", detail: "Filipperbrevet" });
  });

  it("prefixes still narrow: '>j3' isn't a passage", () => {
    expect(buildResults(">j3", ctx()).some((r) => r.group === "passage")).toBe(false);
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
    expect(row).toMatchObject({ detail: "Psalm 23:1 · KJV", href: "/read/PSA/23?v=1", translationId: "kjv" });
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

describe("palette results: marked words", () => {
  const highlights = [
    hl("h1", "For God so loved the world", "JHN", 3, 16),
    hl("h2", "The Lord is my shepherd", "PSA", 23, 1, "kjv"),
    hl("h3", null, "JHN", 3, 3),
  ];

  it("a highlight is found by its marked words: quote, colour, place, opening there", () => {
    const row = buildResults("loved world", ctx({ highlights })).find((r) => r.group === "highlights");
    expect(row).toMatchObject({
      id: "highlight:h1",
      label: "For God so loved the world",
      color: "green",
      detail: "John 3:16",
      href: "/read/JHN/3?v=16",
    });
    expect(row?.translationId).toBeUndefined();
  });

  it("a highlight in another version: names it and opens in it", () => {
    const row = buildResults("lord shep", ctx({ highlights })).find((r) => r.id === "highlight:h2");
    expect(row).toMatchObject({ detail: "Psalm 23:1 · KJV", translationId: "kjv" });
  });

  it("highlights come after margin notes; a typed passage lists the ones on it", () => {
    expect(ids("john 3:16", ctx({ highlights }))).toEqual(["passage", "highlight:h1"]);
    expect(ids("john 3", ctx({ highlights }))).toEqual([
      "passage",
      "note:n2",
      "annotation:x1",
      "annotation:x3",
      "highlight:h3",
      "highlight:h1",
    ]);
  });

  it("a highlight without a quote yet: not found by words, labelled by its place on a passage", () => {
    expect(ids("born", ctx({ highlights })).filter((id) => id.startsWith("highlight"))).toEqual([]);
    expect(buildResults("john 3:3", ctx({ highlights })).find((r) => r.id === "highlight:h3")?.label).toBe("John 3:3");
  });

  it("a long quote is clipped around the match", () => {
    const long = `${"word ".repeat(30)}needle ${"tail ".repeat(30)}`.trim();
    const row = buildResults("needle", ctx({ highlights: [hl("l", long, "ROM", 1, 1)] })).find((r) => r.id === "highlight:l");
    expect(row?.label.startsWith("…")).toBe(true);
    expect(row?.label.length).toBeLessThan(100);
  });

  it("a renamed colour: its highlights are found by the name, which the row shows", () => {
    const named = ctx({ highlights, colorLabel: (c) => (c === "green" ? "God speaking" : undefined) });
    expect(ids("god speak", named).filter((id) => id.startsWith("highlight"))).toEqual(["highlight:h1", "highlight:h2", "highlight:h3"]);
    expect(buildResults("shepherd", named).find((r) => r.id === "highlight:h2")?.kind).toBe("God speaking");
    // Plain colour names never match (every "green" highlight would)
    expect(ids("green", ctx({ highlights })).filter((id) => id.startsWith("highlight"))).toEqual([]);
  });

  it("a colour is found by its own name or its plain one, as one row that brings it out", () => {
    const named = ctx({ highlights, colorLabel: (c) => (c === "green" ? "God speaking" : undefined) });
    const row = buildResults("god speaking", named)[0];
    expect(row).toMatchObject({
      id: "color:green",
      group: "colors",
      label: "Focus on God speaking",
      detail: "3 highlights · green",
      filterColor: "green",
      match: "god speaking",
    });
    expect(ids("green", named)[0]).toBe("color:green");
    expect(ids("grøn", named)[0]).toBe("color:green");
    // Unnamed: its plain name; a colour nobody used isn't offered
    expect(buildResults("green", ctx({ highlights }))[0]).toMatchObject({ label: "Focus on green", detail: "3 highlights" });
    expect(ids("blue", ctx({ highlights }))).not.toContain("color:blue");
    // Never on a passage ("god 3" isn't a colour)
    expect(ids("john 3", named)).not.toContain("color:green");
  });

  it("found by its colour's name: all of that colour, not just five", () => {
    const many = Array.from({ length: 8 }, (_, i) => hl(`g${i}`, `verse ${i}`, "PSA", 1, i + 1));
    const named = ctx({ highlights: many, colorLabel: (c) => (c === "green" ? "God speaking" : undefined) });
    expect(ids("god speaking", named).filter((id) => id.startsWith("highlight"))).toHaveLength(8);
    expect(ids("verse", named).filter((id) => id.startsWith("highlight"))).toHaveLength(5);
  });

  it("@ includes highlights", () => {
    expect(ids("@shepherd", ctx({ highlights }))).toEqual(["annotation:x2", "highlight:h2"]);
  });

  it("a margin note is found by its marked words too, shown after its place", () => {
    const a = { ...ann("q", "Love!", "JHN", 3, 16), quote: "For God so loved the world" };
    const row = buildResults("world", ctx({ annotations: [a] })).find((r) => r.id === "annotation:q");
    expect(row).toMatchObject({ label: "Love!", detail: "John 3:16 · For God so loved the world" });
    expect(row?.kind).toBeUndefined();
  });

  it("a pen mark without words: the quote is its label, with a Mark hint", () => {
    const mark = { ...ann("m", "", "JHN", 3, 16), quote: "God so loved" };
    const nullText = { ...ann("n", "", "JHN", 3, 17), text: null as unknown as string, quote: "not to judge" };
    const c = ctx({ annotations: [mark, nullText] });
    expect(buildResults("loved", c).find((r) => r.id === "annotation:m")).toMatchObject({
      label: "God so loved",
      detail: "John 3:16",
      kind: "Mark",
    });
    expect(buildResults("judge", c).find((r) => r.id === "annotation:n")).toMatchObject({ label: "not to judge", kind: "Mark" });
    // Neither words nor quote: labelled by its place
    const bare = ctx({ annotations: [{ ...ann("b", "", "JHN", 3, 2), text: null as unknown as string }] });
    expect(buildResults("john 3:2", bare).find((r) => r.id === "annotation:b")?.label).toBe("John 3:2");
  });
});

describe("matchRanges (bold)", () => {
  const bold = (text: string, q: string) => matchRanges(text, q).map(([a, b]) => text.slice(a, b));

  it("every word a query word starts, all hits, case-insensitive", () => {
    expect(bold("He who doesn't love doesn't know God, for God is love", "god")).toEqual(["God", "God"]);
    expect(bold("Switch to dark view", "sw da")).toEqual(["Sw", "da"]);
  });

  it("only at word starts, as matching does", () => {
    expect(bold("Promise from God", "rom")).toEqual([]);
  });

  it("the longest query word wins on a word", () => {
    expect(bold("God speaking", "g god")).toEqual(["God"]);
  });

  it("accents and Danish letters: ranges in the original text", () => {
    expect(bold("Født af Ånden", "anden")).toEqual(["Ånden"]);
    expect(bold("Født af Ånden", "født")).toEqual(["Født"]);
    expect(bold("Guds kærlighed", "kærl")).toEqual(["kærl"]);
    expect(bold("Café crème", "creme")).toEqual(["crème"]);
    // Decomposed input (a + combining ring) keeps its mark inside the bold
    expect(bold("A\u030Andens frugt", "and")).toEqual(["A\u030And"]);
  });

  it("nothing typed, nothing bold", () => {
    expect(matchRanges("God", "")).toEqual([]);
    expect(matchRanges("", "god")).toEqual([]);
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
