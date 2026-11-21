import { announce } from "~/lib/announce";
import i18n from "./i18n";
import { pendingInGroup, postNotice, type Place, undoMs, visibleUndo } from "./notices";
import { ApiError } from "./query";

/**
 * Feedback without toasts (#64, #257 panel 2026-11-21): a delete says what
 * happened and offers Undo; a write that fails says so (no silent catch)
 * and offers Retry where repeating it makes sense — as one inline line in
 * the chrome next to the action (lib/notices + components/inline-notice),
 * never over the text. Routine success/info ("Copied", "Highlighted", a
 * theme change) shows nothing: it's read out by lib/announce.
 */

export { UNDO_MS } from "./notices";

/** "Note deleted · Undo". `undo` should resolve once restored; a rejected
 * undo says so in the same place. Same-`group` removals in a row merge:
 * `many(n)` names them ("3 highlights removed") and Undo restores all. */
export function notifyUndo(
  message: string,
  undo: () => Promise<unknown>,
  {
    place = "page",
    group,
    item = "",
    many,
  }: {
    place?: Place;
    group?: string;
    /** What within the group (highlight / annotation), counted apart. */
    item?: string;
    many?: (items: Record<string, number>) => string;
  } = {},
) {
  const prev = group ? pendingInGroup(place, group) : null;
  const undos: (() => unknown)[] = [undo];
  if (prev?.action) undos.push(prev.action.run);
  const items = { ...prev?.items, [item]: (prev?.items?.[item] ?? 0) + 1 };
  const count = (prev?.count ?? 0) + 1;
  const runAll = () =>
    Promise.all(undos.map((u) => u())).catch((e: unknown) => {
      console.error("[undo]", e);
      postNotice(place, { kind: "error", message: i18n.t("notice.undoFailed") });
    });
  postNotice(place, {
    kind: "undo",
    message: count > 1 && many ? many(items) : message,
    action: { label: i18n.t("notice.undo"), run: runAll },
    ms: undoMs(),
    group,
    count,
    items,
  });
}

/** "Couldn't save · Retry". Pass `retry` to offer the button; `message`
 * defaults to the generic save failure. Errors stay until Retry, × or the
 * next notice. */
export function notifyError(
  e: unknown,
  {
    message = i18n.t("notice.saveFailed"),
    retry,
    place = "page",
  }: {
    message?: string;
    retry?: () => unknown;
    place?: Place;
  } = {},
): number | null {
  console.error("[write]", e);
  // Signed out: api() is already on its way to sign-in (and back here) —
  // a Retry would only fail again
  if (e instanceof ApiError && e.status === 401) return null;
  return postNotice(place, {
    kind: "error",
    message,
    action: retry ? { label: i18n.t("notice.retry"), run: retry } : undefined,
  });
}

/** An eraser sweep in one line: "3 highlights removed", "2 highlights and
 * 1 margin note removed" (panel D3). */
export function marksRemoved(items: Record<string, number>): string {
  const parts = (["highlight", "annotation"] as const)
    .filter((k) => items[k])
    .map((k) => i18n.t(`notice.${k}s`, { count: items[k] }));
  return parts.length === 2
    ? i18n.t("notice.bothRemoved", { a: parts[0], b: parts[1] })
    : i18n.t("notice.nRemoved", { what: parts[0] ?? "" });
}

/** A short "it happened" in the notice place (keyboard copy) — never over
 * a visible Undo (Undo outranks info). */
export function notifyInfo(message: string, ms = 3000, place: Place = "page") {
  if (visibleUndo(place)) return;
  postNotice(place, { kind: "info", message, ms });
}

/**
 * The delete flow for soft-deleted study items (#64): hide at once
 * (optimistic), DELETE, then "<message> · Undo". A failed delete un-hides
 * and says so (with Retry). Resolves true when deleted.
 */
export async function removeWithUndo({
  hide,
  unhide,
  remove,
  restore,
  message,
  retry,
  place,
  group,
  item,
  many,
  inPlace,
}: {
  hide: () => void;
  unhide: () => void;
  remove: () => Promise<unknown>;
  restore: () => Promise<unknown>;
  message: string;
  retry: () => unknown;
  place?: Place;
  group?: string;
  item?: string;
  many?: (items: Record<string, number>) => string;
  /** The screen shows "Removed · Undo" where the item was (the Notes
   * list): it gets the undo instead of a notice line. */
  inPlace?: (undo: () => Promise<unknown>) => void;
}): Promise<boolean> {
  hide();
  try {
    await remove();
  } catch (e) {
    unhide();
    notifyError(e, { message: i18n.t("notice.deleteFailed"), retry, place });
    return false;
  }
  if (inPlace) inPlace(restore);
  else notifyUndo(message, restore, { place, group, item, many });
  return true;
}

/** "Copied John 3:16 (WEB)" — read out; the Copy control shows "Copied ✓"
 * itself (panel C5), keyboard copy shows it in the notice place. */
export function announceCopied(reference: string, translation: string, { show = false } = {}) {
  const message = i18n.t("announce.copied", { ref: reference, translation });
  announce(message);
  if (show) notifyInfo(message);
}

/** Copy refused: over the licences' 100-verse limit (ToS §12). Calm, no
 * error styling — but shown: otherwise a paste brings back whatever was on
 * the clipboard before, silently. */
export function notifyCopyLimit() {
  postNotice("page", { kind: "info", message: i18n.t("notice.copyLimit"), ms: 10_000 });
}

/** Copy failed (clipboard blocked / no permission). */
export function notifyCopyFailed(e: unknown) {
  notifyError(e, { message: i18n.t("notice.copyFailed") });
}
