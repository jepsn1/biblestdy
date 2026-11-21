/**
 * Which translations Compare shows next to the reading one (#167): saved per
 * device in localStorage `compareTranslations` — an array of translation
 * ids, the shape an account preference would take later. Every read and
 * write is wrapped: blocked storage just means no memory.
 */
export const PICKS_KEY = "compareTranslations";

/** At most 3 others, and never more than there are. */
export function compareCap(available: number): number {
  return Math.max(0, Math.min(3, available - 1));
}

/**
 * The stored picks, cleaned: only ids still offered (`others`, in picker
 * order), never the reading translation, no duplicates, at most `cap`.
 * null = nothing stored yet (first open on this device) or unreadable.
 */
export function parsePicks(raw: string | null, others: readonly string[], cap: number): string[] | null {
  if (raw === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(value)) return null;
  const wanted = new Set(value.filter((v): v is string => typeof v === "string"));
  // Picker order, whatever order they were saved in
  return others.filter((id) => wanted.has(id)).slice(0, cap);
}

/** First open ticks every other translation (up to the cap) — the owner's
 * default; flip FIRST_OPEN_ALL to start empty. */
export const FIRST_OPEN_ALL = true;

/** The picks to start with: the stored ones, or (first open) all others. */
export function initialPicks(raw: string | null, others: readonly string[], cap: number): string[] {
  return parsePicks(raw, others, cap) ?? (FIRST_OPEN_ALL ? others.slice(0, cap) : []);
}

export function readPicks(): string | null {
  try {
    return localStorage.getItem(PICKS_KEY);
  } catch {
    return null;
  }
}

export function savePicks(ids: readonly string[]) {
  try {
    localStorage.setItem(PICKS_KEY, JSON.stringify(ids));
  } catch {
    // Storage blocked: picks last this visit only
  }
}

/** Tick/untick in picker order; a tick over the cap is refused (null). */
export function togglePick(picks: readonly string[], id: string, on: boolean, others: readonly string[], cap: number): string[] | null {
  const set = new Set(picks);
  if (on) {
    if (set.has(id)) return [...picks];
    if (set.size >= cap) return null;
    set.add(id);
  } else set.delete(id);
  return others.filter((x) => set.has(x));
}

/** Phone steps (#218): pick translations, then compare them. */
export type CompareStep = "pick" | "compare";

/** Picks remembered on this device → straight to the passages; first open
 * (nothing stored, or none still offered) → the picker. */
export function firstStep(raw: string | null, others: readonly string[], cap: number): CompareStep {
  return (parsePicks(raw, others, cap)?.length ?? 0) > 0 ? "compare" : "pick";
}

/** The picker offers a filter from this many other translations (#258). */
export const FILTER_FROM = 7;

/** The translations whose words (abbreviation, name, description) contain
 * every word of the query, any case; an empty query keeps all. */
export function filterTranslations<T>(items: readonly T[], query: string, words: (item: T) => string[]): T[] {
  const parts = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!parts.length) return [...items];
  return items.filter((item) => {
    const hay = words(item).join(" ").toLocaleLowerCase();
    return parts.every((p) => hay.includes(p));
  });
}
