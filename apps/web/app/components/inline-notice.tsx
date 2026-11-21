import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { modKey } from "~/components/hint";
import { dismissNotice, mountPlace, type Notice, type Place, useNotice } from "~/lib/notices";
import { cn, focusRing } from "~/lib/utils";

/**
 * The one inline notice (#257, panel 2026-11-21): a single line in the
 * chrome next to the action — "Highlight removed · Undo", "Couldn't save ·
 * Retry ×" — never over the text, never a toast.
 *
 * - Both live regions are always mounted (a region born with its text
 *   often isn't read): status for Undo/info, alert for errors.
 * - Nothing takes focus. Undo/Retry are real word buttons (44px on touch).
 * - Undo/info time out, paused while hovered or focused; errors stay
 *   until Retry, × or the next notice. × only on errors (Undo expires).
 * - If focus was inside when it goes, focus moves to `focusAfter`.
 *
 * `children` is what the slot shows when there's no notice (the support
 * line, the phone's chapter bar): the notice takes its place, same box.
 */
export function InlineNotice({
  place,
  className,
  lineClassName,
  oneLine,
  focusAfter,
  children,
}: {
  place: Place;
  className?: string;
  lineClassName?: string;
  /** Clamp to one line (a slot that must not grow: the running foot). */
  oneLine?: boolean;
  focusAfter?: () => HTMLElement | null;
  children?: React.ReactNode;
}) {
  const notice = useNotice(place);
  useEffect(() => mountPlace(place), [place]);
  return (
    <NoticeLine notice={notice} className={className} lineClassName={lineClassName} oneLine={oneLine} focusAfter={focusAfter}>
      {children}
    </NoticeLine>
  );
}

/** The line itself, for a notice held locally (in-place cases). */
export function NoticeLine({
  notice,
  onGone,
  className,
  lineClassName,
  oneLine,
  focusAfter,
  children,
}: {
  notice: Notice | null;
  /** Called when it times out or is closed (default: drop from the store). */
  onGone?: (id: number) => void;
  className?: string;
  lineClassName?: string;
  oneLine?: boolean;
  focusAfter?: () => HTMLElement | null;
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [held, setHeld] = useState(false);
  const gone = (id: number) => {
    const hadFocus = ref.current?.contains(document.activeElement);
    (onGone ?? dismissNotice)(id);
    if (hadFocus) requestAnimationFrame(() => focusAfter?.()?.focus({ preventScroll: true }));
  };
  const goneRef = useRef(gone);
  goneRef.current = gone;

  // A fresh notice starts un-held (the pointer may still be over the slot)
  useEffect(() => setHeld(false), [notice?.id]);
  useEffect(() => {
    if (!notice?.ms || held) return;
    const timer = window.setTimeout(() => goneRef.current(notice.id), notice.ms);
    return () => window.clearTimeout(timer);
  }, [notice?.id, notice?.ms, held]);

  const error = notice?.kind === "error";
  return (
    // Listens only: hover/focus pause the timer (the buttons inside act)
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      ref={ref}
      data-inline-notice=""
      onPointerEnter={(e) => e.pointerType === "mouse" && setHeld(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(e) => !ref.current?.contains(e.relatedTarget as Node | null) && setHeld(false)}
      className={className}
    >
      <span role="status" className="sr-only">
        {notice && !error ? notice.message : ""}
      </span>
      <span role="alert" className="sr-only">
        {error ? notice.message : ""}
      </span>
      {notice ? (
        <p
          data-notice-kind={notice.kind}
          className={cn(
            "flex min-h-6 min-w-0 items-center justify-center gap-x-1 text-center text-control motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150",
            oneLine ? "flex-nowrap" : "flex-wrap text-balance",
            lineClassName,
          )}
        >
          <span aria-hidden className={cn("min-w-0", oneLine && "truncate", error ? "text-destructive" : "text-muted-foreground")}>
            {notice.message}
          </span>
          {notice.action && (
            <>
              <span aria-hidden className="text-muted-foreground">
                {" ·"}
              </span>
              <button
                type="button"
                onClick={() => {
                  const run = notice.action!.run;
                  gone(notice.id);
                  void run();
                }}
                className={cn(
                  "group inline-flex min-h-6 shrink-0 items-center gap-1 rounded-md px-1 font-medium text-foreground pointer-coarse:-my-2.5 pointer-coarse:min-h-11 pointer-coarse:px-2",
                  focusRing,
                )}
              >
                <span className="underline underline-offset-4 group-hover:decoration-2">{notice.action.label}</span>
                {/* Ctrl/Cmd+Z runs it too (panel D6) */}
                {notice.kind === "undo" && (
                  <span className="font-normal text-muted-foreground pointer-coarse:hidden">({modKey()}Z)</span>
                )}
              </button>
            </>
          )}
          {error && (
            <button
              type="button"
              aria-label={t("notice.close")}
              onClick={() => gone(notice.id)}
              className={cn(
                "inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground pointer-coarse:-my-2.5 pointer-coarse:size-11",
                focusRing,
              )}
            >
              <X className="size-3.5" aria-hidden />
            </button>
          )}
        </p>
      ) : (
        children
      )}
    </div>
  );
}
