import type { CompareAnchor } from "./dialog-events";

/**
 * What "Compare translations" acts on when it isn't opened from a menu (the
 * palette's action, the translation sheet's row): the selection, else the
 * focused verse, else the first verse on the page (#167). The reader's text
 * reports its selection and focused verse here; the palette and the sheet
 * take a snapshot as they open — before focus moves into them and the
 * reader lets go of a keyboard selection.
 */

export type CompareCandidates = {
  selection?: CompareAnchor | null;
  focused?: CompareAnchor | null;
  first?: CompareAnchor | null;
};

/** The fallback order: selection → focused verse → first on the page. */
export function pickCompareTarget(c: CompareCandidates): CompareAnchor | null {
  return c.selection ?? c.focused ?? c.first ?? null;
}

/** Per rendered chapter (the page's own and the one running on). */
const selections = new Map<string, CompareAnchor | null>();
const focusedVerses = new Map<string, CompareAnchor | null>();

const firstOf = (m: Map<string, CompareAnchor | null>) => [...m.values()].find((a) => a) ?? null;

export function noteCompareSelection(key: string, anchor: CompareAnchor | null) {
  if (anchor) selections.set(key, anchor);
  else selections.delete(key);
}

export function noteCompareFocus(key: string, anchor: CompareAnchor | null) {
  if (anchor) focusedVerses.set(key, anchor);
  else focusedVerses.delete(key);
}

let snapshot: CompareCandidates = {};

/** Call as a surface opens (palette, translation sheet). */
export function snapshotCompareTarget() {
  snapshot = { selection: firstOf(selections), focused: firstOf(focusedVerses) };
}

/** The snapshot's target, else `first` (the first verse on the page). */
export function compareTargetOr(first: CompareAnchor | null): CompareAnchor | null {
  return pickCompareTarget({ ...snapshot, first });
}
