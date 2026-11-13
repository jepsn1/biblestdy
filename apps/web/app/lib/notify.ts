import { toast } from "sonner";
import i18n from "./i18n";

/**
 * Feedback toasts (#64): every destructive action says what happened and
 * offers Undo; every write that fails says so (no silent catch) and offers
 * Retry where repeating it makes sense. Sonner announces toasts in an
 * aria-live region.
 */

/** How long Undo stays on screen. The server keeps a deleted row for an
 * hour (RESTORE_WINDOW_MS), so a slow undo still lands. */
export const UNDO_MS = 5000;

/** "Note deleted · Undo". `undo` should resolve once restored; a rejected
 * undo shows its own error toast. */
export function notifyUndo(message: string, undo: () => Promise<unknown>) {
  toast(message, {
    duration: UNDO_MS,
    action: {
      label: i18n.t("toast.undo"),
      onClick: () => {
        undo().catch((e: unknown) => {
          console.error("[undo]", e);
          toast.error(i18n.t("toast.undoFailed"));
        });
      },
    },
  });
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

/** Copy failed (clipboard blocked / no permission). */
export function notifyCopyFailed(e: unknown) {
  notifyError(e, { message: i18n.t("toast.copyFailed") });
}
