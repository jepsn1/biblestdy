import {
  parseReference,
  suggestBooks,
  type Annotation,
  type BookLocale,
  type Note,
  type Reference,
  type Tag,
} from "@biblestdy/shared";
import { referenceHref } from "../reader/chapter-nav";

/**
 * Command palette results (one pure function, so the ranking is testable):
 * the typed text → fixed, grouped rows. Order never changes while typing,
 * and a parsed reference is always the first row, so "rom 8:28 ⏎" is one
 * step. Prefixes narrow to one group: `>` actions, `#` topics, `@` notes
 * (and margin notes).
 * Never touches scripture (reading quota): rows are references and titles.
 */

export type GroupId = "recent" | "passage" | "books" | "actions" | "notes" | "annotations" | "topics" | "hint";

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

export type RecentPassage = { book: string; chapter: number };

export type PaletteContext = {
  locale: BookLocale;
  bookName: (id: string) => string;
  notes: Note[];
  /** Margin notes (inline annotations), most recent first. */
  annotations: Annotation[];
  tags: Tag[];
  actions: PaletteAction[];
  recent: RecentPassage[];
  here: RecentPassage;
  /** The reading translation: a note opens on its anchor in this one. */
  translationId: string;
  /** A translation's abbreviation ("KJV"), shown on other-version rows. */
  translationAbbr: (id: string) => string;
  labels: {
    goTo: (ref: string) => string;
    /** Empty palette with no history: what to type. */
    emptyHint: string;
    morePassages: (n: number) => string;
    invalid: string;
    noTextSearch: string;
    untitled: string;
  };
};

export const LIMITS = { books: 6, actions: 6, notes: 5, annotations: 5, topics: 5, recent: 5, common: 4 };

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

/** Markdown → plain text, enough for matching and snippets. */
export function plainText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_~`>#]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function refLabel(ctx: PaletteContext, ref: Reference): string {
  const name = ctx.bookName(ref.book);
  if (ref.chapter === undefined) return name;
  if (ref.verse === undefined) return `${name} ${ref.chapter}`;
  const sep = ctx.locale === "da" ? "," : ":";
  let out = `${name} ${ref.chapter}${sep}${ref.verse}`;
  if (ref.endVerse !== undefined) {
    out += ref.endChapter !== undefined && ref.endChapter !== ref.chapter ? `–${ref.endChapter}${sep}${ref.endVerse}` : `–${ref.endVerse}`;
  }
  return out;
}

/** The anchor a row shows and opens: the one that matched the typed passage,
 * else the one in the reading translation, else the first. */
function noteItem(ctx: PaletteContext, note: Note, snippet?: string, matched?: Note["anchors"][number]): PaletteItem {
  const a = matched ?? note.anchors.find((x) => x.translationId === ctx.translationId) ?? note.anchors[0];
  const more = new Set(note.anchors.map((x) => `${x.book}${x.chapter}${x.startVerse}`)).size - 1;
  const ref = a && refLabel(ctx, { book: a.book, chapter: a.chapter, verse: a.startVerse });
  const title = note.title.trim() || plainText(note.body).slice(0, 60) || ctx.labels.untitled;
  return {
    id: `note:${note.id}`,
    group: "notes",
    label: title,
    detail: [ref, more > 0 && ctx.labels.morePassages(more), snippet].filter(Boolean).join(" · ") || undefined,
    href: a ? `/read/${a.book}/${a.chapter}?note=${note.id}` : undefined,
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

/** A margin note: its words, where it sits, and the version if not this one. */
function annotationItem(ctx: PaletteContext, a: Annotation, q: string): PaletteItem {
  const end = a.endVerse !== a.startVerse ? a.endVerse : undefined;
  const ref = refLabel(ctx, { book: a.book, chapter: a.chapter, verse: a.startVerse, endVerse: end });
  const other = a.translationId !== ctx.translationId;
  return {
    id: `annotation:${a.id}`,
    group: "annotations",
    label: snippet(a.text, q) ?? (a.text.length > 80 ? `${a.text.slice(0, 80).trim()}…` : a.text),
    detail: other ? `${ref} · ${ctx.translationAbbr(a.translationId)}` : ref,
    href: referenceHref({ book: a.book, chapter: a.chapter, verse: a.startVerse }),
    translationId: other ? a.translationId : undefined,
  };
}

const actionItem = (a: PaletteAction): PaletteItem => ({
  id: `action:${a.id}`,
  group: "actions",
  label: a.label,
  action: a.id,
  shortcut: a.shortcut,
  checked: a.checked,
});

export function buildResults(input: string, ctx: PaletteContext): PaletteItem[] {
  const raw = input.trim();

  if (!raw) {
    // Recently read first (where you were), then a few actions
    const out: PaletteItem[] = [];
    const seen = new Set([`${ctx.here.book}/${ctx.here.chapter}`]);
    for (const r of ctx.recent) {
      const key = `${r.book}/${r.chapter}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ id: `recent:${key}`, group: "recent", label: refLabel(ctx, r), href: `/read/${key}` });
      if (out.filter((i) => i.group === "recent").length >= LIMITS.recent) break;
    }
    if (out.length === 0) out.push({ id: "empty-hint", group: "hint", label: ctx.labels.emptyHint, disabled: true });
    out.push(...ctx.actions.filter((a) => a.common).slice(0, LIMITS.common).map(actionItem));
    return out;
  }

  const prefix = raw[0];
  const only = prefix === ">" ? "actions" : prefix === "#" ? "topics" : prefix === "@" ? "notes" : null;
  const q = only ? raw.slice(1).trim() : raw;
  const out: PaletteItem[] = [];

  // 1. The typed reference
  const ref = only ? null : parseReference(q, ctx.locale);
  if (ref && ref.chapter !== undefined) {
    out.push({ id: "passage", group: "passage", label: ctx.labels.goTo(refLabel(ctx, ref)), href: referenceHref(ref) });
  }

  // 2. Books (word-start, both languages); Enter = chapter 1, Tab completes
  if (!only && !(ref && ref.chapter !== undefined)) {
    const bookPart = /^\s*(\d?\.?\s*\p{L}[\p{L}\s.']*)$/u.exec(q)?.[1];
    if (bookPart) {
      for (const s of suggestBooks(bookPart, ctx.locale, LIMITS.books)) {
        out.push({ id: `book:${s.id}`, group: "books", label: s.name, detail: s.alt, href: `/read/${s.id}/1`, complete: `${s.name} ` });
      }
    } else if (/\d/.test(q) && /\p{L}/u.test(q)) {
      // Looks like a reference but isn't one ("rom 99")
      out.push({ id: "invalid", group: "hint", label: ctx.labels.invalid, disabled: true });
    }
  }

  // 3. Actions
  if (!only || only === "actions") {
    const hits = q ? ctx.actions.filter((a) => wordPrefixMatch([a.label, ...a.keywords].join(" "), q)) : ctx.actions;
    out.push(...hits.slice(0, only ? hits.length : LIMITS.actions).map(actionItem));
  }

  // A span on the typed passage (chapter, or verses overlapping the range)
  const onPassage =
    ref && ref.chapter !== undefined
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
        return h.length ? [noteItem(ctx, n, undefined, h.find((a) => a.translationId === ctx.translationId) ?? h[0])] : [];
      });
    } else if (q) {
      const scored: { n: Note; score: number; body: string }[] = [];
      for (const n of ctx.notes) {
        const body = plainText(n.body);
        if (wordPrefixMatch(n.title, q)) scored.push({ n, score: 0, body });
        else if (wordPrefixMatch(body, q)) scored.push({ n, score: 1, body });
      }
      scored.sort((a, b) => a.score - b.score);
      notes = scored.map(({ n, score, body }) => noteItem(ctx, n, score === 1 ? snippet(body, q) : undefined));
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
        ? ctx.annotations.filter((a) => wordPrefixMatch(a.text, q))
        : [];
    out.push(...hits.slice(0, only ? 50 : LIMITS.annotations).map((a) => annotationItem(ctx, a, onPassage ? "" : q)));
  }

  // 6. Topics
  if ((!only && !(ref && ref.chapter !== undefined)) || only === "topics") {
    const hits = q ? ctx.tags.filter((t) => wordPrefixMatch(t.name, q)) : ctx.tags;
    out.push(
      ...hits.slice(0, only ? 50 : LIMITS.topics).map((t) => ({
        id: `topic:${t.id}`,
        group: "topics" as const,
        label: `#${t.name}`,
        href: `/topic/${encodeURIComponent(t.name)}`,
      })),
    );
  }

  if (out.length === 0) out.push({ id: "none", group: "hint", label: ctx.labels.noTextSearch, disabled: true });
  return out;
}
