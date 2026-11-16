import type { Chapter, MappedSlice, ScriptureRef, TargetUnits } from "@biblestdy/shared";
import { targetUnits } from "@biblestdy/shared/versification";
import { MAX_COPY_VERSES } from "~/lib/licence-limits";
import { ReadingLimited } from "./reading-limit";

/**
 * Compare translations (#167), the pure part: what each translation's block
 * shows once its chapters are (or aren't) in — text, numbering notes, why it
 * can't show — what it reports to FUMS, and the "Copy all" payload. Lives in
 * the dialog's chunk only (it pulls in the versification map).
 */

// ---- errors --------------------------------------------------------------

/** Why a block can't show its text (yet). */
export type BlockError = "limited-short" | "limited-long" | "daily" | "unavailable" | "failed";

/** A chapter fetch's failure as a block reads it. `loadChapter` throws
 * ReadingLimited (429) or react-router `data()` payloads (404/502 — not
 * Errors); anything else is a plain failure. */
export function blockError(err: unknown): BlockError {
  if (err instanceof ReadingLimited) {
    if (err.limit.reason === "daily") return "daily";
    return err.shortWait ? "limited-short" : "limited-long";
  }
  const status =
    (err as { init?: { status?: number } } | null)?.init?.status ??
    (err as { status?: number } | null)?.status;
  return status === 404 ? "unavailable" : "failed";
}

/** Seconds a limited block waits (for "Try again in about …"). */
export function blockWait(err: unknown): number | undefined {
  return err instanceof ReadingLimited ? err.limit.retryAfterSeconds : undefined;
}

// ---- chapters ------------------------------------------------------------

export type ChapterRef = { book: string; chapter: number };

/** The chapters a translation's slices need fetched, in reading order, once
 * each. Unmapped slices and unnumbered psalm titles need none. */
export function sliceChapters(slices: readonly MappedSlice[]): ChapterRef[] {
  const out: ChapterRef[] = [];
  for (const s of slices) {
    if (s.kind === "unmapped" || s.startVerse === 0) continue;
    if (!out.some((c) => c.book === s.book && c.chapter === s.chapter)) out.push({ book: s.book, chapter: s.chapter });
  }
  return out;
}

/** One chapter's fetch as a block sees it. `limited`: waiting out a short
 * reading-quota wait (it retries by itself). */
export type Loaded =
  | { status: "pending"; limited?: boolean }
  | { status: "error"; error: unknown }
  | { status: "ok"; chapter: Chapter };

// ---- block view ----------------------------------------------------------

/** Whole verse units `from`..`to` (stored numbers) of one chapter. */
export type Part = { chapter: Chapter; from: number; to: number };

/** Header notes — UI words, never in the text flow, never copied. */
export type BlockNote =
  /** "Verse numbers differ here: {{ref}} in {{abbr}}" (the reading one's numbers) */
  | { kind: "renumbered"; source: ScriptureRef }
  /** "Placed at {{ref}} in this translation" */
  | { kind: "moved"; ref: ScriptureRef }
  /** "This translation has no verse {{n}}" */
  | { kind: "absent"; verses: number[] }
  | { kind: "psalmTitle" }
  /** "Couldn't match the verses in this translation" (+ Continue in) */
  | { kind: "unmapped" };

export type BlockView =
  | { kind: "loading"; limited: boolean; verses: number }
  | { kind: "problem"; error: Exclude<BlockError, "unavailable" | "limited-short">; wait?: number; cause: unknown }
  | {
      kind: "ready";
      parts: Part[];
      notes: BlockNote[];
      /** This translation's own reference for what it shows (null: nothing). */
      ref: ScriptureRef | null;
      /** FUMS tokens of the chapters whose text is on screen. */
      tokens: string[];
      /** A mapped chapter 404'd (logged by the caller). */
      missing: ChapterRef[];
    };

const keyOf = (c: ChapterRef) => `${c.book}.${c.chapter}`;

/** Last printed number of a unit ("14–15" → 15). */
function lastNumber(v: { verse: number; label?: string }): number {
  const m = v.label ? /(\d+)\D*$/.exec(v.label) : null;
  const n = m ? Number(m[1]) : v.verse;
  return n > v.verse ? n : v.verse;
}

const sliceLength = (s: MappedSlice) => (s.kind === "unmapped" || s.startVerse === 0 ? 0 : s.endVerse - s.startVerse + 1);

/**
 * What one translation's block shows. `load` gives each needed chapter's
 * state (see sliceChapters). Still loading → a skeleton sized in verses; a
 * limit or failure → that block's message (the others carry on); otherwise
 * the text parts + notes. A 404 on a mapped chapter reads as "couldn't
 * match" — never a silent fallback to the same verse number.
 */
export function blockView(slices: readonly MappedSlice[], load: (c: ChapterRef) => Loaded): BlockView {
  const chapters = sliceChapters(slices);
  const states = new Map(chapters.map((c) => [keyOf(c), load(c)]));
  const verses = slices.reduce((n, s) => n + sliceLength(s), 0);

  const pending = [...states.values()].filter((s) => s.status === "pending");
  const errors = [...states.values()].flatMap((s) => (s.status === "error" ? [s.error] : []));
  const kinds = errors.map(blockError);
  if (pending.length > 0 || kinds.includes("limited-short")) {
    return { kind: "loading", limited: pending.some((s) => s.limited) || kinds.includes("limited-short"), verses };
  }
  const worst = (["failed", "daily", "limited-long"] as const).find((k) => kinds.includes(k));
  if (worst) {
    const cause = errors[kinds.indexOf(worst)];
    return { kind: "problem", error: worst, wait: blockWait(cause), cause };
  }

  const parts: Part[] = [];
  const notes: BlockNote[] = [];
  const missing: ChapterRef[] = [];
  const note = (n: BlockNote) => {
    if (n.kind === "absent") {
      const had = notes.find((x): x is Extract<BlockNote, { kind: "absent" }> => x.kind === "absent");
      if (had) had.verses.push(...n.verses.filter((v) => !had.verses.includes(v)));
      else notes.push({ kind: "absent", verses: [...n.verses] });
    } else if (!notes.some((x) => x.kind === n.kind)) notes.push(n);
  };
  const addPart = (chapter: Chapter, from: number, to: number) => {
    const prev = parts[parts.length - 1];
    if (prev && prev.chapter === chapter) {
      // Overlapping, or next to it (no stored unit in between): one part
      const between = chapter.verses.some((v) => v.verse > prev.to && v.verse < from);
      if (from <= prev.to || !between) {
        prev.from = Math.min(prev.from, from);
        prev.to = Math.max(prev.to, to);
        return;
      }
    }
    parts.push({ chapter, from, to });
  };
  // The reading translation's numbers where they differ (one note per block)
  let renumbered: { c0: number; v0: number; c1: number; v1: number } | null = null;

  for (const s of slices) {
    if (s.kind === "unmapped") {
      note({ kind: "unmapped" });
      continue;
    }
    if (s.startVerse === 0) {
      note({ kind: "psalmTitle" });
      continue;
    }
    const state = states.get(keyOf(s));
    const chapter = state?.status === "ok" ? state.chapter : null;
    if (!chapter && !missing.some((m) => m.book === s.book && m.chapter === s.chapter)) missing.push({ book: s.book, chapter: s.chapter });
    const units: TargetUnits = targetUnits(chapter, s);
    if (units.kind === "unmapped") note({ kind: "unmapped" });
    else if (units.kind === "psalmTitle") note({ kind: "psalmTitle" });
    else if (units.kind === "absent") {
      note({ kind: "absent", verses: units.absent });
      // The neighbours, so the gap sits in place (same chapter, no fetch)
      const from = units.before ?? units.after;
      const to = units.after ?? units.before;
      if (chapter && from !== undefined && to !== undefined) addPart(chapter, from, to);
    } else if (chapter) {
      addPart(chapter, units.startVerse, units.endVerse);
      if (units.absent.length) note({ kind: "absent", verses: units.absent });
      if (s.kind === "moved") {
        const ref: ScriptureRef = { book: s.book, chapter: s.chapter, verse: units.printedStart };
        if (units.printedEnd > units.printedStart) ref.endVerse = units.printedEnd;
        note({ kind: "moved", ref });
      }
    }
    if (s.kind === "renumbered") {
      const src = s.source;
      if (!renumbered) renumbered = { c0: src.chapter, v0: src.startVerse, c1: src.endChapter, v1: src.endVerse };
      else Object.assign(renumbered, { c1: src.endChapter, v1: src.endVerse });
    }
  }
  if (renumbered) {
    const { c0, v0, c1, v1 } = renumbered;
    const source: ScriptureRef = { book: slices[0].book, chapter: c0, verse: v0 };
    if (c1 !== c0) Object.assign(source, { endChapter: c1, endVerse: v1 });
    else if (v1 !== v0) source.endVerse = v1;
    notes.unshift({ kind: "renumbered", source });
  }

  const first = parts[0];
  const last = parts[parts.length - 1];
  let ref: ScriptureRef | null = null;
  if (first && last) {
    const lastUnit = last.chapter.verses.filter((v) => v.verse <= last.to).pop();
    const end = lastUnit ? lastNumber(lastUnit) : last.to;
    ref = { book: first.chapter.book, chapter: first.chapter.chapter, verse: first.from };
    if (last.chapter.chapter !== first.chapter.chapter) {
      ref.endChapter = last.chapter.chapter;
      ref.endVerse = end;
    } else if (end > first.from) ref.endVerse = end;
  }
  const tokens = [...new Set(parts.flatMap((p) => (p.chapter.fumsToken ? [p.chapter.fumsToken] : [])))];
  return { kind: "ready", parts, notes, ref, tokens, missing };
}

/** Numbering differs from the reading translation (Copy all names the
 * block's own reference then). */
export function numberingDiffers(slices: readonly MappedSlice[]): boolean {
  return slices.some((s) => s.kind !== "same");
}

/** Where "Continue in" lands: the first mapped verse; an unmapped block
 * goes to its chapter without a verse (never a guessed number). */
export function jumpTarget(slices: readonly MappedSlice[]): { book: string; chapter: number; verse?: number } | null {
  const hit = slices.find((s) => s.kind !== "unmapped" && s.startVerse > 0);
  if (hit) return { book: hit.book, chapter: hit.chapter, verse: hit.startVerse };
  const any = slices[0];
  return any ? { book: any.book, chapter: any.chapter } : null;
}

// ---- copy ----------------------------------------------------------------

/** Verses the parts carry (a bridge "14–15" counts as both). */
export function partsVerseCount(parts: readonly Part[]): number {
  let n = 0;
  for (const p of parts) {
    for (const v of p.chapter.verses) {
      if (v.verse < p.from || v.verse > p.to) continue;
      n += lastNumber(v) - v.verse + 1;
    }
  }
  return n;
}

/** The plain words of the parts, verses joined by a space (no numbers). */
export function partsText(parts: readonly Part[]): string {
  return parts
    .flatMap((p) => p.chapter.verses.filter((v) => v.verse >= p.from && v.verse <= p.to).map((v) => v.text.trim()))
    .filter(Boolean)
    .join(" ");
}

/** One block in Copy all. `ref`: its own reference, given only when its
 * numbering differs ("BPH (Salme 51,3): …"). */
export type CopyBlock = { abbr: string; ref?: string; parts: readonly Part[] };

/** Copy all's total verse count: the licences' 100-verse cap counts every
 * translation's verses. */
export function copyAllCount(blocks: readonly CopyBlock[]): number {
  return blocks.reduce((n, b) => n + partsVerseCount(b.parts), 0);
}

export function canCopyAll(blocks: readonly CopyBlock[]): boolean {
  return copyAllCount(blocks) <= MAX_COPY_VERSES;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Copy all: a header line ("John 3:16 — NIV · NKJV · BPH"), one paragraph
 * per translation ("NIV: …", "BPH (Salme 51,3): …" when its numbers
 * differ), then each copyright line once. Notes are never copied.
 */
export function formatCopyAll(reference: string, blocks: readonly CopyBlock[]): { text: string; html: string } {
  const shown = blocks.filter((b) => b.parts.length > 0);
  const header = `${reference} — ${shown.map((b) => b.abbr).join(" · ")}`;
  const paragraphs = shown.map((b) => `${b.abbr}${b.ref ? ` (${b.ref})` : ""}: ${partsText(b.parts)}`);
  const rights: string[] = [];
  for (const b of shown) {
    for (const p of b.parts) {
      const line = p.chapter.copyright?.trim();
      if (line && !rights.includes(line)) rights.push(line);
    }
  }
  const text = [header, ...paragraphs, rights.join("\n")].filter(Boolean).join("\n\n");
  const html = [header, ...paragraphs].map((l) => `<p>${escapeHtml(l)}</p>`).join("") +
    (rights.length ? `<p>${rights.map(escapeHtml).join("<br>")}</p>` : "");
  return { text, html };
}

/** FUMS: the tokens of every block whose text is on screen. A block still
 * loading reports nothing; an unticked one isn't among the views at all. */
export function fumsTokens(views: readonly BlockView[]): string[] {
  return [...new Set(views.flatMap((v) => (v.kind === "ready" ? v.tokens : [])))];
}

/** Copy, per block (#167): the whole verses' words, then the reference line
 * and the chapter's copyright line — today's copy format (formatCopy). */
export function versesCopy(
  parts: readonly Part[],
  reference: string,
  abbreviation: string,
): { text: string; html: string } {
  const body = parts
    .flatMap((p) => p.chapter.verses.filter((v) => v.verse >= p.from && v.verse <= p.to).map((v) => v.text.trim()))
    .filter(Boolean)
    .join(" ");
  const lines = [body, `${reference} (${abbreviation})`];
  for (const p of parts) {
    const c = p.chapter.copyright?.trim();
    if (c && !lines.includes(c)) lines.push(c);
  }
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return { text: lines.join("\n"), html: lines.map(esc).join("<br>") };
}
