import type { Chapter, MappedSlice, ScriptureRef, TargetUnits } from "@biblestdy/shared";
import { targetUnits } from "@biblestdy/shared/versification";
import type { ReadingLimited } from "./reading-limit";

/**
 * Compare translations (#167), the pure part: what each translation's block
 * shows once its chapters are (or aren't) in — text, numbering notes, why it
 * can't show — and what it reports to FUMS. Lives in
 * the dialog's chunk only (it pulls in the versification map).
 */

// ---- errors --------------------------------------------------------------

/** Why a block can't show its text (yet). */
export type BlockError = "limited-short" | "limited-long" | "daily" | "unavailable" | "failed";

/** A chapter fetch's failure as a block reads it. `loadChapter` throws
 * ReadingLimited (429) or react-router `data()` payloads (404/502 — not
 * Errors); anything else is a plain failure. */
/** A reading-quota refusal (reading-limit.ts' ReadingLimited) — by shape,
 * so this chunk doesn't import the reader's module (bundle budget). */
export function isLimited(err: unknown): err is ReadingLimited {
  return err instanceof Error && err.name === "ReadingLimited" && "limit" in err;
}

export function blockError(err: unknown): BlockError {
  if (isLimited(err)) {
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
  return isLimited(err) ? err.limit.retryAfterSeconds : undefined;
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

/** Header notes — UI words, never in the text flow. */
export type BlockNote =
  /** "Verse numbers differ here: {{ref}} in {{abbr}}" (the reading one's numbers) */
  | { kind: "renumbered"; source: ScriptureRef }
  /** "Placed at {{ref}} in this translation" */
  | { kind: "moved"; ref: ScriptureRef }
  /** "This translation has no verse {{n}}" */
  | { kind: "absent"; verses: number[] }
  | { kind: "psalmTitle" }
  /** "Couldn't match the verses in this translation" */
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

/** Numbering differs from the reading translation (the block names its
 * own reference then). */
export function numberingDiffers(slices: readonly MappedSlice[]): boolean {
  return slices.some((s) => s.kind !== "same");
}

/** FUMS: the tokens of every block whose text is on screen. A block still
 * loading reports nothing; an unticked one isn't among the views at all. */
export function fumsTokens(views: readonly BlockView[]): string[] {
  return [...new Set(views.flatMap((v) => (v.kind === "ready" ? v.tokens : [])))];
}
