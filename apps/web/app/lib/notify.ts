import { toast } from "sonner";
import i18n from "./i18n";
import { ApiError } from "./query";

/**
 * Feedback toasts (#64): every destructive action says what happened and
 * offers Undo; every write that fails says so (no silent catch) and offers
 * Retry where repeating it makes sense. Sonner announces toasts in an
 * aria-live region.
 */

/** How long Undo stays on screen — long enough to Tab or swipe to it
 * (WCAG 2.2.1). Hovering pauses it (Sonner); so does focus inside the toast
 * (holdWhileFocused). The server keeps a deleted row for an hour
 * (RESTORE_WINDOW_MS), so a slow undo still lands. */
export const UNDO_MS = 10_000;

let undoSeq = 0;

/** "Note deleted · Undo". `undo` should resolve once restored; a rejected
 * undo shows its own error toast. */
export function notifyUndo(message: string, undo: () => Promise<unknown>, ms = UNDO_MS) {
  const id = `undo-${++undoSeq}`;
  let release = () => {};
  const show = (duration: number) =>
    toast(message, {
      id,
      // Also the hook holdWhileFocused finds the toast by
      className: id,
      duration,
      onDismiss: () => release(),
      onAutoClose: () => release(),
      action: {
        label: i18n.t("toast.undo"),
        onClick: () => {
          release();
          undo().catch((e: unknown) => {
            console.error("[undo]", e);
            toast.error(i18n.t("toast.undoFailed"));
          });
        },
      },
    });
  show(ms);
  // Same id = updated in place: no timer while focused, a fresh one after
  release = holdWhileFocused(`.${id}`, (held) => show(held ? Infinity : ms));
}

/** Calls `onChange(true)` when focus moves into `selector`, `false` when it
 * leaves. Returns the unsubscribe. No-op without a document (tests, SSR). */
export function holdWhileFocused(
  selector: string,
  onChange: (held: boolean) => void,
  doc: Pick<Document, "addEventListener" | "removeEventListener"> | undefined = typeof document !==
  "undefined"
    ? document
    : undefined,
): () => void {
  if (!doc) return () => {};
  let held = false;
  const update = (el: EventTarget | null) => {
    const inside = !!(el as Element | null)?.closest?.(selector);
    if (inside !== held) onChange((held = inside));
  };
  const onIn = (e: Event) => update(e.target);
  const onOut = (e: Event) => update((e as FocusEvent).relatedTarget);
  doc.addEventListener("focusin", onIn);
  doc.addEventListener("focusout", onOut);
  return () => {
    doc.removeEventListener("focusin", onIn);
    doc.removeEventListener("focusout", onOut);
  };
}

/** "Couldn't save · Retry". Pass `retry` to offer the button; `message`
 * defaults to the generic save failure. */
export function notifyError(
  e: unknown,
  {
    message = i18n.t("toast.saveFailed"),
    retry,
    id,
  }: {
    message?: string;
    retry?: () => unknown;
    /** Same id = one toast, updated in place (e.g. repeated autosave failures). */
    id?: string;
  } = {},
) {
  console.error("[write]", e);
  // Signed out: api() is already on its way to sign-in (and back here) —
  // a Retry would only fail again
  if (e instanceof ApiError && e.status === 401) return;
  toast.error(message, {
    id,
    // Errors wait for the reader — a retry they never saw is no retry
    duration: retry ? 10_000 : 6000,
    action: retry ? { label: i18n.t("toast.retry"), onClick: () => void retry() } : undefined,
  });
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
}: {
  hide: () => void;
  unhide: () => void;
  remove: () => Promise<unknown>;
  restore: () => Promise<unknown>;
  message: string;
  retry: () => unknown;
}): Promise<boolean> {
  hide();
  try {
    await remove();
  } catch (e) {
    unhide();
    notifyError(e, { message: i18n.t("toast.deleteFailed"), retry });
    return false;
  }
  notifyUndo(message, restore);
  return true;
}

/** "Copied John 3:16 (WEB)". */
export function notifyCopied(reference: string, translation: string) {
  toast(i18n.t("toast.copied", { ref: reference, translation }));
}

/** Copy refused: over the licences' 100-verse limit (ToS §12). Calm, no
 * error styling — nothing went wrong. */
export function notifyCopyLimit() {
  toast(i18n.t("toast.copyLimit"), { duration: 8000 }); // long enough to read
}

/** Copy failed (clipboard blocked / no permission). */
export function notifyCopyFailed(e: unknown) {
  notifyError(e, { message: i18n.t("toast.copyFailed") });
}
