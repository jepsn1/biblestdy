import { type Query, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { cn, focusRing } from "~/lib/utils";

/**
 * "Couldn't load your marks · Retry" — one quiet line, shown only when a
 * load failed, so a failure never looks like "you have nothing" (a reader
 * who thinks their highlights are gone would mark them again). No banner:
 * muted text in the page's own chrome, and the text stays fully usable.
 *
 * The status region is always mounted (empty, no height, when all is well)
 * — screen readers announce a change inside a live region, not a region
 * that appears (or content it mounts with) — and nothing takes focus. Retry is a ≥24px target; it stays
 * focusable while it works, and when the loads come back (the line goes)
 * focus moves to `focusAfter` rather than dropping to the page.
 */
export function LoadError({
  failed,
  message,
  onRetry,
  focusAfter,
  className,
}: {
  failed: boolean;
  message: string;
  /** Loads again; resolves when done (either way). */
  onRetry: () => Promise<unknown>;
  /** Where focus goes if it was on Retry when the line goes. */
  focusAfter?: () => HTMLElement | null;
  /** On the line itself (spacing applies only while it shows). */
  className?: string;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  // Shown a commit after `failed`: a failure already there on mount is a
  // change inside the (mounted) live region too, so it gets announced
  const [shown, setShown] = useState(false);
  useEffect(() => setShown(failed), [failed]);
  const ref = useRef<HTMLDivElement>(null);
  const hadFocus = useRef(false);

  async function retry() {
    if (busy) return;
    hadFocus.current = ref.current?.contains(document.activeElement) ?? false;
    setBusy(true);
    await onRetry().catch(() => {});
    setBusy(false);
  }

  // Loaded: Retry is gone — hand focus on instead of losing it to <body>
  useEffect(() => {
    if (failed || !hadFocus.current) return;
    hadFocus.current = false;
    if (!document.activeElement || document.activeElement === document.body) {
      focusAfter?.()?.focus({ preventScroll: true });
    }
  }, [failed, focusAfter]);

  return (
    <div ref={ref} role="status">
      {failed && shown && (
        <p className={cn("text-control text-muted-foreground text-balance", className)}>
          {message}
          <span aria-hidden>{" · "}</span>
          <button
            type="button"
            onClick={() => void retry()}
            aria-disabled={busy || undefined}
            className={cn(
              "-mx-1 inline-flex min-h-6 items-center rounded-md px-1 font-medium text-foreground underline underline-offset-4 hover:decoration-2 aria-disabled:cursor-progress aria-disabled:opacity-60",
              focusRing,
            )}
          >
            {t("toast.retry")}
          </button>
        </p>
      )}
    </div>
  );
}

/** A chapter's marks query: ["highlights" | "annotations" | "notes",
 * translation, book, chapter] — not the palette's/picker's "all" lists, not
 * the other-version counts. */
function isChapterMarks(q: Query): boolean {
  const [kind, second] = q.queryKey;
  return (
    (kind === "highlights" || kind === "annotations" || kind === "notes") &&
    second !== "all" &&
    second !== "other-versions"
  );
}

/** Whether any chapter on screen — the one being read, or the next one's
 * opening run on into its last page — failed to load its marks, and a retry
 * of just those. Read from the query cache, so every reader of a chapter's
 * marks counts without wiring each one through. */
export function useMarksLoad() {
  const qc = useQueryClient();
  const cache = qc.getQueryCache();
  const failed = useSyncExternalStore(
    (onChange) => cache.subscribe(onChange),
    () => cache.findAll({ predicate: (q) => isChapterMarks(q) && q.isActive() && q.state.status === "error" }).length > 0,
    () => false,
  );
  const retry = useCallback(
    () => qc.refetchQueries({ type: "active", predicate: (q) => isChapterMarks(q) && q.state.status === "error" }),
    [qc],
  );
  return { failed, retry };
}

/** The reader's marks (highlights, annotations, notes) failed to load. */
export function MarksLoadError(props: Omit<Parameters<typeof LoadError>[0], "message">) {
  const { t } = useTranslation();
  return <LoadError {...props} message={t("reader.marksLoadFailed")} />;
}
