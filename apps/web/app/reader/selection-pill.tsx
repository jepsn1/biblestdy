import { Ellipsis, FileText, Highlighter, X } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSafeInsets } from "~/lib/safe-area";
import { cn, focusRing } from "~/lib/utils";
import { PILL_ABOVE, PILL_EDGE, pillPlace } from "./held-selection";

type Rect = { left: number; right: number; top: number; bottom: number };

const surface = "fixed z-50 rounded-lg border border-border bg-popover text-popover-foreground shadow-sm";
const button = cn(
  "inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 text-list font-medium hover:bg-accent [&_svg]:size-4 [&_svg]:shrink-0",
  focusRing,
);

/**
 * The phone's tap-selection pill (#206): Highlight · Note · More, each an
 * icon + word, then a divider and an icon-only × Close (#217) — set apart
 * so it never reads as a fourth action. Under the selection (above it when there's no room). Never takes focus,
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
  const safe = useSafeInsets();
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Above any open drawer (the note's Back-to-note bar included) and
    // the phone's chapter bar (#238)
    const drawerTops = [...document.querySelectorAll('[data-slot="drawer-popup"], [data-chapter-bar]')]
      .map((d) => d.getBoundingClientRect().top)
      .filter((top) => top > 0);
    const bottom = Math.min(window.innerHeight - safe.bottom, ...drawerTops) - PILL_ABOVE;
    setAt(pillPlace(start, end, { width: el.offsetWidth, height: el.offsetHeight }, window.innerWidth, bottom, safe));
  }, [start, end, safe]);
  return (
    // A tap on the surface between buttons lets the selection go (as on the text)
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <div
      ref={ref}
      data-selection-ui=""
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
      <div className="flex items-start">
        {/* At large text the actions wrap; Close stays top-right */}
        <div className="flex min-w-0 flex-wrap">
          <button type="button" className={button} onClick={onHighlight}>
            {/* The pen with the colour it will use as a dot on its tip */}
            <span aria-hidden className="relative inline-flex">
              <Highlighter />
              <span
                className="absolute -right-0.5 -bottom-0.5 size-2 rounded-full ring-1 ring-foreground/30"
                style={{ background: color }}
              />
            </span>
            {t("menu.pillHighlight")}
          </button>
          <button type="button" className={button} onClick={onNote}>
            <FileText aria-hidden />
            {t("menu.pillNote")}
          </button>
          <button type="button" aria-haspopup="menu" className={button} onClick={onMore}>
            <Ellipsis aria-hidden />
            {t("menu.pillMore")}
          </button>
        </div>
        <span aria-hidden className="mx-0.5 my-2 w-px self-stretch bg-border" />
        <button
          type="button"
          aria-label={t("menu.pillClose")}
          title={t("menu.pillClose")}
          className={cn(button, "w-11 shrink-0 justify-center px-0 text-muted-foreground hover:text-foreground [&_svg]:size-5")}
          onClick={onClose}
        >
          <X aria-hidden />
        </button>
      </div>
    </div>
  );
}

/** While a handle is held: the range, 56px above the fingertip, kept off
 * the screen's sides (a reference is never wider than ~150px at 12px). */
export function DragRefTag({ x, y, text }: { x: number; y: number; text: string }) {
  return (
    <p
      aria-hidden
      className={cn(surface, "pointer-events-none -translate-x-1/2 px-2 py-0.5 text-meta whitespace-nowrap")}
      style={{ left: Math.max(PILL_EDGE + 76, Math.min(x, window.innerWidth - PILL_EDGE - 76)), top: y - 56 }}
    >
      {text}
    </p>
  );
}
