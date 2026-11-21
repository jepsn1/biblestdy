import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { announce } from "~/lib/announce";
import { undoMs } from "~/lib/notices";
import { cn, focusRing } from "~/lib/utils";

/**
 * "Removed · Undo" where the removed thing was (#257 panel D4): a tag chip,
 * a Verses-list row, the Recent list. Plain muted text at the same height
 * — no dashed border, no strike-through.
 *
 * - Read out once (lib/announce: a region mounted with its text isn't).
 * - Lasts undoMs() (10 s, 20 s on touch), paused while hovered/focused.
 * - `focus`: the removed thing's × had focus — Undo takes it (no drop to
 *   <body>). When it goes with focus inside, `onGone(true)` lets the owner
 *   move focus on (next chip/row, else "+ add").
 */
export function UndoInPlace({
  label,
  said,
  onUndo,
  onGone,
  focus = false,
  ms: lasts,
  className,
}: {
  /** What shows: "Removed", "John 3:16 removed". */
  label: string;
  /** What's read out (names the thing): "Topic “grace” removed". */
  said?: string;
  onUndo: () => unknown;
  /** Timed out (not undone); `hadFocus` = focus was inside. */
  onGone: (hadFocus: boolean) => void;
  focus?: boolean;
  /** Override the lifetime (Infinity: until its owner goes, as "Ryd"). */
  ms?: number;
  className?: string;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const [held, setHeld] = useState(false);
  const [ms] = useState(() => lasts ?? undoMs());
  const goneRef = useRef(onGone);
  goneRef.current = onGone;

  useEffect(() => {
    announce(said ?? label);
    if (focus) button.current?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on mount
  }, []);
  useEffect(() => {
    if (held || ms === Infinity) return;
    const timer = window.setTimeout(() => goneRef.current(!!ref.current?.contains(document.activeElement)), ms);
    return () => window.clearTimeout(timer);
  }, [held, ms]);

  return (
    // Listens only: hover/focus pause the timer (the buttons inside act)
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <span
      ref={ref}
      data-undo-in-place=""
      onPointerEnter={(e) => e.pointerType === "mouse" && setHeld(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(e) => !ref.current?.contains(e.relatedTarget as Node | null) && setHeld(false)}
      className={cn("inline-flex items-center gap-1 text-muted-foreground", className)}
    >
      <span>{label}</span>
      <span aria-hidden>·</span>
      <button
        ref={button}
        type="button"
        onClick={() => onUndo()}
        className={cn(
          "-my-1 inline-flex min-h-6 items-center rounded-md px-1 font-medium text-foreground underline underline-offset-4 hover:decoration-2 pointer-coarse:-my-2.5 pointer-coarse:min-h-11",
          focusRing,
        )}
      >
        {t("notice.undo")}
        <span className="sr-only">: {said ?? label}</span>
      </button>
    </span>
  );
}
