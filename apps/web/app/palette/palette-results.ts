import {
  bookName,
  HIGHLIGHT_COLORS,
  suggestBooks,
  type Annotation,
  type BookLocale,
  type Highlight,
  type HighlightColor,
  type Note,
  type Reference,
  type Tag,
} from "@biblestdy/shared";
import { referenceLabel } from "~/lib/reference-label";
import { placesToOffer, START_PLACES } from "~/lib/recent-passages";
import { chapterHref, referenceHref } from "../reader/chapter-nav";
import { bookQuery, findPassages, reversedBook, typoBooks, type PassageHit } from "./passage-query";

/**
 * Command palette results (one pure function, so the ranking is testable):
 * the typed text → fixed, grouped rows. Empty, it's a launcher: a few
 * commands, then recently read. Typed, it's a search: the passages it could
 * mean come first ("rom 8:28 ⏎" is one step; "j3" offers John 3, James 3…,
 * see passage-query), then books, your study
 * (colours, notes, margin notes, highlights), topics, and commands last.
 * Order never changes while typing. Prefixes narrow to one group: `>`
 * commands, `#` topics, `@` notes (and margin notes, highlights). Marks also
 * match on their marked words (`quote`); highlights also on the reader's own
 * name for their colour ("God speaking" — not plain "gold", too noisy; that
 * finds the colour itself). Rows carry the words to bold (`match`).
 * Never touches scripture (reading quota): rows are references and titles.
 */

export type GroupId =
  | "recent"
  | "start"
  | "passage"
  | "books"
  | "actions"
  | "notes"
  | "annotations"
  | "highlights"
  | "colors"
  | "topics"
  | "hint";

export type PaletteItem = {
  id: string;
  group: GroupId;
  label: string;
  detail?: string;
  /** Navigational rows are links (⌘/Ctrl-click opens a new tab). */
  href?: string;
  /** Action rows run this registry id. */
  action?: string;
  shortcut?: string;
  checked?: boolean;
  /** Tab puts this text in the input (book completion). */
  complete?: string;
  /** Not selectable (a hint line). */
  disabled?: boolean;
  /** Opens in this translation (a margin note lives in one). */
  translationId?: string;
  /** A highlight row's colour (dot). */
  color?: HighlightColor;
  /** Small kind hint after the label ("Mark": a margin note without words). */
  kind?: string;
  /** The typed words, to bold where they hit label, detail and kind. */
  match?: string;
  /** A colour row: brings this colour out in the reader (colour key filter). */
  filterColor?: HighlightColor;
};

export type PaletteAction = {
  id: string;
  label: string;
  /** Extra words that find it, both UI languages ("mørk", "dark"). */
  keywords: string[];
  shortcut?: string;
  checked?: boolean;
  /** Offered on the empty palette. */
  common?: boolean;
};

/** `page`: 0-based, the one last open (absent = the first). */
export type RecentPassage = { book: string; chapter: number; page?: number };

export type PaletteContext = {
  locale: BookLocale;
  bookName: (id: string) => string;
  notes: Note[];
  /** Margin notes (inline annotations), most recent first. */
  annotations: Annotation[];
  /** Highlights, newest first. */
  highlights: Highlight[];
  tags: Tag[];
  actions: PaletteAction[];
  recent: RecentPassage[];
  here: RecentPassage;
  /** The reading translation: a note opens on its anchor in this one. */
  translationId: string;
  /** A translation's abbreviation ("KJV"), shown on other-version rows. */
  translationAbbr: (id: string) => string;
  /** The reader's own name for a highlight colour ("God speaking"), if any. */
  colorLabel: (c: HighlightColor) => string | undefined;
  /** A colour's plain names, both UI languages ("blue", "blå"): find its row. */
  colorWords: (c: HighlightColor) => string[];
  labels: {
    /** Detail of a passage found through a typo ("jonh 3" → John 3). */
    closest: string;
    morePassages: (n: number) => string;
    invalid: string;
    /** Nothing found: says so, with the typed text… */
    noMatches: (q: string) => string;
    /** …and that the Bible text itself isn't searchable yet. */
    noTextSearch: string;
    /** A colour row: "Focus on God speaking" + "Colour · 2 highlights". */
    focusColor: (name: string) => string;
    colorDetail: (n: number) => string;
    untitled: string;
    /** Kind hint of a margin note that's only a pen mark (no words). */
    mark: string;
    /** "Continue: John 3, page 2" (page 0-based; none on the first). */
    continueAt: (place: string, page?: number) => string;
    /** A good place to start's plain line (START_PLACES `line`). */
    startLine: (line: string) => string;
  };
};

export const LIMITS = { passages: 5, books: 6, actions: 6, notes: 5, annotations: 5, highlights: 5, topics: 5, recent: 5, common: 4, colorHits: 20 };

/** Lowercase, accents folded (é → e), so matching ignores both. */
export function fold(s: string): string {
  return s.toLocaleLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Every query word starts some word of the text ("da mo" ↔ "Dark mode"). */
export function wordPrefixMatch(text: string, query: string): boolean {
  const words = fold(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return fold(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((q) => words.some((w) => w.startsWith(q)));
}

/**
 * Where the typed words hit `text`, as [start, end) ranges into it (for
 * bold): the start of every word that a query word starts, as
 * `wordPrefixMatch` matches — case- and accent-insensitive ("guds" in
 * "Guds", "anden" in "Ånden"), all hits, merged and in order.
 */
export function matchRanges(text: string, query: string): [number, number][] {
  const words = fold(query).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (!words.length || !text) return [];
  // The folded text, each folded char mapped back to its original char
  let folded = "";
  const from: number[] = [];
  const to: number[] = [];
  for (let i = 0; i < text.length; ) {
    const ch = String.fromCodePoint(text.codePointAt(i)!);
    const f = fold(ch);
    for (let k = 0; k < f.length; k++) {
      from.push(i);
      to.push(i + ch.length);
    }
    folded += f;
    i += ch.length;
  }
  const hits: [number, number][] = [];
  for (const m of folded.matchAll(/[\p{L}\p{N}]+/gu)) {
    // The longest query word that starts this word
    const len = Math.max(0, ...words.filter((w) => m[0].startsWith(w)).map((w) => w.length));
    if (len) hits.push([from[m.index], to[m.index + len - 1]]);
  }
  return hits;
}

/** Markdown → plain text, enough for matching and snippets. */
export function plainText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_~`>#]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** A passage row's words to bold: letters and numbers apart ("j3" → "j 3":
 * the J of John, the 3). */
function passageMatch(q: string): string {
  return q.match(/\p{L}+|\d+/gu)?.join(" ") ?? "";
}

/** A passage as the reader's language writes it ("Salme 23", "Johannes
 * 3,16"): the app's one reference formatter, so a row reads as the Notes
 * page and the reader do. */
function refLabel(ctx: PaletteContext, ref: Reference): string {
  return referenceLabel(ref, ctx.bookName, ctx.locale);
}

/** The anchor a row shows and opens: the one that matched the typed passage,
 * else the one in the reading translation, else the first. */
function noteItem(ctx: PaletteContext, note: Note, q: string, snippet?: string, matched?: Note["anchors"][number]): PaletteItem {
  const a = matched ?? note.anchors.find((x) => x.translationId === ctx.translationId) ?? note.anchors[0];
  const more = new Set(note.anchors.map((x) => `${x.book}${x.chapter}${x.startVerse}`)).size - 1;
  const ref = a && refLabel(ctx, { book: a.book, chapter: a.chapter, verse: a.startVerse });
  const title = note.title.trim() || plainText(note.body).slice(0, 60) || ctx.labels.untitled;
  return {
    id: `note:${note.id}`,
    group: "notes",
    label: title,
    detail: [ref, more > 0 && ctx.labels.morePassages(more), snippet].filter(Boolean).join(" · ") || undefined,
    href: a ? `/read/${a.book}/${a.chapter}?note=${note.id}` : `/notes/${note.id}`,
    match: q || undefined,
  };
}

/** ±40 characters around the first hit of the first query word. */
function snippet(text: string, query: string): string | undefined {
  const q = fold(query).split(/\s+/)[0];
  if (!q) return undefined;
  const i = fold(text).indexOf(q);
  if (i < 0) return undefined;
  const start = Math.max(0, i - 40);
  return `${start > 0 ? "…" : ""}${text.slice(start, i + q.length + 40).trim()}${i + q.length + 40 < text.length ? "…" : ""}`;
}

/** ~80 characters: around the match, else the start. */
function excerpt(text: string, q: string): string {
  return snippet(text, q) ?? (text.length > 80 ? `${text.slice(0, 80).trim()}…` : text);
}

type Mark = Pick<Annotation, "book" | "chapter" | "startVerse" | "endVerse" | "translationId"> & { quote?: string | null };

/** Where a mark sits ("John 3:16"), plus the version if not this one, and
 * how to open it there. */
function markPlace(ctx: PaletteContext, a: Mark) {
  const end = a.endVerse !== a.startVerse ? a.endVerse : undefined;
  const ref = refLabel(ctx, { book: a.book, chapter: a.chapter, verse: a.startVerse, endVerse: end });
  const other = a.translationId !== ctx.translationId;
  return {
    ref,
    detail: other ? `${ref} · ${ctx.translationAbbr(a.translationId)}` : ref,
    href: referenceHref({ book: a.book, chapter: a.chapter, verse: a.startVerse }),
    translationId: other ? a.translationId : undefined,
  };
}

/** A margin note's own words (none for a pen mark without text). */
const noteText = (a: { text?: string | null }) => a.text?.trim() ?? "";
const quoteOf = (a: Mark) => a.quote?.trim() ?? "";

/** A margin note: its words, where it sits, and the version if not this one.
 * A pen mark without words shows the marked words instead ("Mark"); a match
 * only in the marked words shows them after the place. */
function annotationItem(ctx: PaletteContext, a: Annotation, q: string): PaletteItem {
  const { ref, detail, ...open } = markPlace(ctx, a);
  const text = noteText(a);
  const quote = quoteOf(a);
  const inQuote = !!q && !!quote && !(text && wordPrefixMatch(text, q));
  return {
    id: `annotation:${a.id}`,
    group: "annotations",
    label: text ? excerpt(text, q) : quote ? excerpt(quote, q) : ref,
    detail: text && inQuote ? `${detail} · ${excerpt(quote, q)}` : detail,
    kind: text ? undefined : ctx.labels.mark,
    match: q || undefined,
    ...open,
  };
}

/** A highlight: the marked words (around the match), its colour, where. */
function highlightItem(ctx: PaletteContext, h: Highlight, q: string): PaletteItem {
  const { ref, detail, ...open } = markPlace(ctx, h);
  const quote = quoteOf(h);
  return {
    id: `highlight:${h.id}`,
    group: "highlights",
    label: quote ? excerpt(quote, q) : ref,
    detail,
    color: h.color,
    // A renamed colour says what it means ("God speaking")
    kind: ctx.colorLabel(h.color),
    match: q || undefined,
    ...open,
  };
}

const actionItem = (a: PaletteAction, q = ""): PaletteItem => ({
  id: `action:${a.id}`,
  group: "actions",
  label: a.label,
  action: a.id,
  shortcut: a.shortcut,
  checked: a.checked,
  match: q || undefined,
});

export function buildResults(input: string, ctx: PaletteContext): PaletteItem[] {
  const raw = input.trim();

  if (!raw) {
    // A launcher: a few commands first, then where you were — "Continue"
    // first, each on the page last open (#142) — and, for a newcomer, good
    // places to start
    const out: PaletteItem[] = ctx.actions.filter((a) => a.common).slice(0, LIMITS.common).map((a) => actionItem(a));
    const offer = placesToOffer(ctx.recent, ctx.here, LIMITS.recent);
    const recentItem = (r: RecentPassage, label: string): PaletteItem => ({
      id: `recent:${r.book}/${r.chapter}`,
      group: "recent",
      label,
      href: chapterHref(r, r.page ?? 0),
    });
    if (offer.continueAt) out.push(recentItem(offer.continueAt, ctx.labels.continueAt(refLabel(ctx, offer.continueAt), offer.continueAt.page)));
    for (const r of offer.recent) out.push(recentItem(r, refLabel(ctx, r)));
    if (offer.start) {
      for (const s of START_PLACES) {
        if (s.book === ctx.here.book && s.chapter === ctx.here.chapter) continue;
        out.push({ id: `start:${s.book}/${s.chapter}`, group: "start", label: refLabel(ctx, s), detail: ctx.labels.startLine(s.line), href: chapterHref(s) });
      }
    }
    return out;
  }

  const prefix = raw[0];
  const only = prefix === ">" ? "actions" : prefix === "#" ? "topics" : prefix === "@" ? "notes" : null;
  const q = only ? raw.slice(1).trim() : raw;
  const out: PaletteItem[] = [];

  // 1. The passages it could mean (only a sure one scopes your study to
  // it: a typo's guess still searches your words, "3 john" is a book first)
  const bookPart = only ? undefined : /^\s*(\d?\.?\s*\p{L}[\p{L}\s.']*)$/u.exec(q)?.[1];
  const hits = only || bookPart ? [] : findPassages(q, ctx.locale, LIMITS.passages);
  const ref = hits[0]?.kind === "exact" || hits[0]?.kind === "prefix" ? hits[0].ref : null;
  const passageItem = (h: PassageHit, i: number): PaletteItem => {
    const label = refLabel(ctx, h.ref);
    return {
      id: i ? `passage:${h.ref.book}` : "passage",
      group: "passage",
      label,
      detail: h.kind === "fuzzy" ? ctx.labels.closest : undefined,
      href: referenceHref(h.ref),
      complete: label,
      match: passageMatch(q),
    };
  };
  out.push(...hits.map(passageItem));

  // 2. Books (word-start, both languages, "first john" too, a misspelt name
  // last); Enter = chapter 1, Tab completes. "3 john" also offers John 3.
  if (bookPart) {
    const found = suggestBooks(bookQuery(bookPart), ctx.locale, LIMITS.books);
    const ids = found.length ? found.map((s) => s.id) : typoBooks(bookPart, ctx.locale);
    for (const id of ids) {
      const name = bookName(id, ctx.locale);
      const alt = bookName(id, ctx.locale === "da" ? "en" : "da");
      out.push({ id: `book:${id}`, group: "books", label: name, detail: alt !== name ? alt : undefined, href: `/read/${id}/1`, complete: `${name} `, match: bookPart });
    }
    const flipped = reversedBook(bookPart, ctx.locale);
    if (flipped) out.push(passageItem(flipped, 1));
  } else if (!only && !hits.length && /\d/.test(q) && /\p{L}/u.test(q)) {
    // Looks like a reference but isn't one ("rom 99")
    out.push({ id: "invalid", group: "hint", label: ctx.labels.invalid, disabled: true });
  }

  // 3. Highlight colours, by the reader's name or the plain one ("God
  // speaking", "blue", "blå"): one row each, that brings the colour out
  const colorHit = (c: HighlightColor) =>
    !!q && [ctx.colorLabel(c) ?? "", ...ctx.colorWords(c)].some((w) => w && wordPrefixMatch(w, q));
  if (!only && !ref) {
    const counts = new Map<HighlightColor, number>();
    for (const h of ctx.highlights) counts.set(h.color, (counts.get(h.color) ?? 0) + 1);
    for (const c of HIGHLIGHT_COLORS) {
      const n = counts.get(c);
      if (!n || !colorHit(c)) continue;
      const own = ctx.colorLabel(c);
      out.push({
        id: `color:${c}`,
        group: "colors",
        label: ctx.labels.focusColor(own ?? ctx.colorWords(c)[0]),
        // A renamed colour also says its plain name (found by either)
        detail: `${ctx.labels.colorDetail(n)}${own ? ` · ${ctx.colorWords(c)[0]}` : ""}`,
        color: c,
        filterColor: c,
        match: q,
      });
    }
  }

  // A span on the typed passage (chapter, or verses overlapping the range)
  const onPassage = ref
    ? (() => {
        const from = ref.verse ?? 1;
        const to = ref.verse === undefined ? Infinity : (ref.endChapter && ref.endChapter !== ref.chapter ? Infinity : (ref.endVerse ?? ref.verse));
        return (a: { book: string; chapter: number; startVerse: number; endVerse: number }) =>
          a.book === ref.book && a.chapter === ref.chapter && a.endVerse >= from && a.startVerse <= to;
      })()
    : null;

  // 4. Notes: on the typed passage, else by words (title hits first)
  if (!only || only === "notes") {
    let notes: PaletteItem[] = [];
    if (onPassage) {
      const hits = (n: Note) => n.anchors.filter(onPassage);
      notes = ctx.notes.flatMap((n) => {
        const h = hits(n);
        return h.length ? [noteItem(ctx, n, "", undefined, h.find((a) => a.translationId === ctx.translationId) ?? h[0])] : [];
      });
    } else if (q) {
      const scored: { n: Note; score: number; body: string }[] = [];
      for (const n of ctx.notes) {
        const body = plainText(n.body);
        if (wordPrefixMatch(n.title, q)) scored.push({ n, score: 0, body });
        else if (wordPrefixMatch(body, q)) scored.push({ n, score: 1, body });
      }
      scored.sort((a, b) => a.score - b.score);
      notes = scored.map(({ n, score, body }) => noteItem(ctx, n, q, score === 1 ? snippet(body, q) : undefined));
    }
    out.push(...notes.slice(0, only ? 50 : LIMITS.notes));
  }

  // 5. Margin notes: on the typed passage (this version first, in verse
  // order), else by words
  if (!only || only === "notes") {
    const elsewhere = (a: Annotation) => Number(a.translationId !== ctx.translationId);
    const hits = onPassage
      ? ctx.annotations
          .filter(onPassage)
          .sort((a, b) => elsewhere(a) - elsewhere(b) || a.startVerse - b.startVerse || a.startWord - b.startWord)
      : q
        ? ctx.annotations.filter((a) => wordPrefixMatch(noteText(a), q) || wordPrefixMatch(quoteOf(a), q))
        : [];
    out.push(...hits.slice(0, only ? 50 : LIMITS.annotations).map((a) => annotationItem(ctx, a, onPassage ? "" : q)));
  }

  // 6. Highlights: on the typed passage (as margin notes), else by the
  // marked words or their colour's own name (then all of that colour)
  if (!only || only === "notes") {
    const elsewhere = (h: Highlight) => Number(h.translationId !== ctx.translationId);
    const byName = (h: Highlight) => wordPrefixMatch(ctx.colorLabel(h.color) ?? "", q);
    const hits = onPassage
      ? ctx.highlights
          .filter(onPassage)
          .sort((a, b) => elsewhere(a) - elsewhere(b) || a.startVerse - b.startVerse || a.startWord - b.startWord)
      : q
        ? ctx.highlights.filter((h) => wordPrefixMatch(quoteOf(h), q) || byName(h))
        : [];
    const limit = only ? 50 : hits.some(byName) ? LIMITS.colorHits : LIMITS.highlights;
    out.push(...hits.slice(0, limit).map((h) => highlightItem(ctx, h, onPassage ? "" : q)));
  }

  // 7. Topics
  if ((!only && !ref) || only === "topics") {
    const hits = q ? ctx.tags.filter((t) => wordPrefixMatch(t.name, q)) : ctx.tags;
    out.push(
      ...hits.slice(0, only ? 50 : LIMITS.topics).map((t) => ({
        id: `topic:${t.id}`,
        group: "topics" as const,
        label: `#${t.name}`,
        href: `/notes?topic=${encodeURIComponent(t.name)}`,
        match: q || undefined,
      })),
    );
  }

  // 8. Commands last while searching (still found by name, both languages)
  if (!only || only === "actions") {
    const hits = q ? ctx.actions.filter((a) => wordPrefixMatch([a.label, ...a.keywords].join(" "), q)) : ctx.actions;
    out.push(...hits.slice(0, only ? hits.length : LIMITS.actions).map((a) => actionItem(a, q)));
  }

  if (out.length === 0) {
    out.push({ id: "none", group: "hint", label: ctx.labels.noMatches(raw), detail: ctx.labels.noTextSearch, disabled: true });
  }
  return out;
}
