import { useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn, focusRing } from "~/lib/utils";
import { PILL_ABOVE, PILL_EDGE, pillPlace } from "./held-selection";
import { SELECTION_UI_ATTR } from "./selection-menu";

type Rect = { left: number; right: number; top: number; bottom: number };

const surface = "fixed z-50 rounded-lg border border-border bg-popover text-popover-foreground shadow-sm";
const button = cn("inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 text-list font-medium hover:bg-accent", focusRing);

/**
 * The phone's tap-selection pill (#206): Highlight · Note · More · Close,
 * under the selection (above it when there's no room). Never takes focus,
 * never covers the selected words; a tap on its surface outside the
 * buttons lets the selection go. Fades in with a 4px rise (none with
 * reduced motion); remounted each time it shows.
 */
export function SelectionPill({
  start,
  end,
  label,
  range,
  color,
  onHighlight,
  onNote,
  onMore,
  onClose,
}: {
  start: Rect;
  end: Rect;
  /** Accessible name — carries the reference. */
  label: string;
  /** The reference, shown when the selection spans verses. */
  range: string | null;
  /** The last-used highlight colour (its dot). */
  color: string;
  onHighlight: () => void;
  onNote: () => void;
  onMore: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Above any open drawer (the note's Back-to-note bar included)
    const drawerTops = [...document.querySelectorAll('[data-slot="drawer-popup"]')]
      .map((d) => d.getBoundingClientRect().top)
      .filter((top) => top > 0);
    const bottom = Math.min(window.innerHeight, ...drawerTops) - PILL_ABOVE;
    setAt(pillPlace(start, end, { width: el.offsetWidth, height: el.offsetHeight }, window.innerWidth, bottom));
  }, [start, end]);
  return (
    // A tap on the surface between buttons lets the selection go (as on the text)
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <div
      ref={ref}
      {...{ [SELECTION_UI_ATTR]: "" }}
      role="group"
      aria-label={label}
      className={cn(surface, "max-w-[calc(100vw-2rem)] p-0.5 duration-120 animate-in fade-in-0 slide-in-from-bottom-1 motion-reduce:animate-none")}
      style={at ?? { left: 0, top: 0, visibility: "hidden" }}
      onClick={(e) => {
        if (!(e.target as Element).closest("button")) onClose();
      }}
    >
      {range && (
        <p aria-hidden className="px-3 pt-1 text-meta text-muted-foreground">
          {range}
        </p>
      )}
      <div className="flex flex-wrap">
        <button type="button" className={button} onClick={onHighlight}>
          <span aria-hidden className="size-2 rounded-full ring-1 ring-foreground/20" style={{ background: color }} />
          {t("menu.pillHighlight")}
        </button>
        <button type="button" className={button} onClick={onNote}>
          {t("menu.pillNote")}
        </button>
        <button type="button" aria-haspopup="menu" className={button} onClick={onMore}>
          {t("menu.pillMore")}
        </button>
        <button type="button" className={button} onClick={onClose}>
          {t("menu.pillClose")}
        </button>
      </div>
    </div>
  );
}

/** While a handle is held: the range, 56px above the fingertip. */
export function DragRefTag({ x, y, text }: { x: number; y: number; text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [left, setLeft] = useState<number | null>(null);
  useLayoutEffect(() => {
    const w = ref.current?.offsetWidth ?? 0;
    setLeft(Math.max(PILL_EDGE, Math.min(x - w / 2, window.innerWidth - PILL_EDGE - w)));
  }, [x, text]);
  return (
    <p
      ref={ref}
      aria-hidden
      className={cn(surface, "pointer-events-none px-2 py-0.5 text-meta whitespace-nowrap")}
      style={{ left: left ?? 0, top: y - 56, visibility: left === null ? "hidden" : undefined }}
    >
      {text}
    </p>
  );
}
