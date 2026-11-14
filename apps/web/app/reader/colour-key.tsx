import { HIGHLIGHT_COLORS, type HighlightColor } from "@biblestdy/shared";
import { ChevronDown } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Hint } from "~/components/hint";
import { useTranslation } from "react-i18next";
import { isShown, setHighlightFilter, toggleColor, useHighlightFilter } from "~/lib/highlight-filter";
import { useColorName, useHighlightLabels } from "~/lib/highlight-labels";
import { cn, focusRing } from "~/lib/utils";
import { HIGHLIGHT_SWATCH } from "./highlight-colors";

const OPEN_KEY = "colourKeyOpen";

/**
 * The colour key (bottom-left of the sheet): what each colour means, once
 * the reader has named one ("blue = God speaking"), and a filter — click a
 * colour to bring its highlights forward (the rest turn see-through), click
 * others to add or drop them,
 * "Show all" to reset. Folds to a small chip; the fold is remembered on this
 * device, the filter only for the session.
 * Never over the text or the running foot: where the key doesn't fit in the
 * margin left of the text (`room`), it shrinks to a swatch button in the
 * palette's gutter that opens the key on demand, over the page until put away.
 */
export function ColourKey({ room }: { room?: number }) {
  const { t } = useTranslation();
  const ids = useId();
  const labels = useHighlightLabels();
  const { title } = useColorName();
  const filter = useHighlightFilter();
  const [open, setOpen] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem(OPEN_KEY) === "0") setOpen(false);
    } catch {
      // storage blocked: starts open
    }
  }, []);
  // Its width as laid out in the margin; 0 = not measured yet (renders there
  // once, measured before paint)
  const keyRef = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState(0);
  const tight = room !== undefined && natural > room;
  /** Tight: the key opened over the page (this visit only). */
  const [popped, setPopped] = useState(false);
  const chipRef = useRef<HTMLButtonElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (tight && !popped) return;
    const w = keyRef.current?.offsetWidth ?? 0;
    setNatural((n) => (n === w ? n : w));
  }, [tight, popped, open, labels, filter, room]);
  useEffect(() => {
    if (!tight) setPopped(false);
  }, [tight]);
  useEffect(() => {
    if (!popped) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setPopped(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [popped]);
  function fold(next: boolean) {
    setOpen(next);
    try {
      localStorage.setItem(OPEN_KEY, next ? "1" : "0");
    } catch {
      // storage blocked: this session only
    }
  }

  // Only once a colour means something (or a filter is still on)
  if (Object.keys(labels).length === 0 && !filter) return null;

  const shown = HIGHLIGHT_COLORS.filter((c) => isShown(filter, c));
  const status = filter
    ? t("colourKey.showing", { colors: shown.map(title).join(", ") })
    : t("colourKey.showingAll");
  const swatch = (c: HighlightColor, on: boolean) => (
    <span
      aria-hidden
      className={cn("size-3.5 shrink-0 rounded-full", on ? "ring-1 ring-foreground/15" : "border-2")}
      style={on ? { background: HIGHLIGHT_SWATCH[c] } : { borderColor: HIGHLIGHT_SWATCH[c] }}
    />
  );

  // Opened from the gutter chip: always the full list; its title puts it away
  const listed = tight ? popped : open;
  function putAway() {
    setPopped(false);
    chipRef.current?.focus();
  }
  // Always mounted: a live region born with its text often isn't read
  const live = (
    <span role="status" className="sr-only">
      {status}
    </span>
  );
  const key = (
    <div
      ref={keyRef}
      role="group"
      aria-labelledby={`${ids}-title`}
      className={cn(
        "pointer-events-auto flex flex-col rounded-[calc(var(--radius-md)+0.25rem+1px)] border border-border bg-background p-1 text-meta shadow-xs",
        tight
          ? "absolute bottom-0 left-full ml-2 w-max max-w-[18rem] shadow-md"
          : "absolute bottom-3 left-3 z-20 max-w-[min(18rem,calc(100%-1.5rem))]",
      )}
    >
      {!tight && live}
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-expanded={listed}
          aria-controls={`${ids}-list`}
          onClick={() => (tight ? putAway() : fold(!open))}
          className={cn(
            "flex h-7 items-center gap-1.5 rounded-md px-2 whitespace-nowrap text-muted-foreground hover:bg-muted hover:text-foreground",
            listed && "min-w-0 flex-1",
            focusRing,
          )}
        >
          {!listed && (
            <span aria-hidden className="flex -space-x-0.5">
              {HIGHLIGHT_COLORS.map((c) => (
                <span key={c} className="contents">
                  {swatch(c, isShown(filter, c))}
                </span>
              ))}
            </span>
          )}
          <span id={`${ids}-title`} className={cn("font-medium", listed && "truncate")}>
            {t("colourKey.title")}
          </span>
          {/* Folded with a filter on: say so, so it isn't forgotten */}
          {!listed && filter && <span className="shrink-0">{t("colourKey.count", { shown: shown.length, all: HIGHLIGHT_COLORS.length })}</span>}
          <ChevronDown aria-hidden className={cn("ml-auto size-3.5 shrink-0 transition-transform", listed && "rotate-180")} />
        </button>
        {filter && (
          <button
            type="button"
            onClick={() => setHighlightFilter(null)}
            className={cn("h-7 shrink-0 rounded-md px-2 font-medium hover:bg-muted", focusRing)}
          >
            {t("colourKey.showAll")}
          </button>
        )}
      </div>
      {listed && (
        <ul id={`${ids}-list`} className="flex flex-col">
          {HIGHLIGHT_COLORS.map((c) => {
            const on = isShown(filter, c);
            return (
              <li key={c}>
                <button
                  type="button"
                  aria-pressed={on}
                  title={title(c)}
                  onClick={() => setHighlightFilter(toggleColor(filter, c))}
                  className={cn(
                    "flex h-7 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left hover:bg-muted",
                    !on && "text-muted-foreground",
                    focusRing,
                  )}
                >
                  {swatch(c, on)}
                  <span className="truncate">{title(c)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  if (!tight) return key;
  // Tight: a swatch button in the palette's gutter (its group's look)
  return (
    <div
      ref={wrapRef}
      // Esc puts the opened key away (its buttons get the keys)
      role="presentation"
      className="pointer-events-auto absolute bottom-3 left-0 z-20 flex w-12 justify-center"
      onKeyDown={(e) => {
        if (e.key !== "Escape" || !popped) return;
        e.stopPropagation(); // not the palette's Esc
        putAway();
      }}
    >
      {live}
      <div className="rounded-[calc(var(--radius-lg)+0.25rem+1px)] border border-border bg-background p-1 shadow-xs">
        <Hint label={t("colourKey.title")} side="right">
          <button
            ref={chipRef}
            type="button"
            aria-label={filter ? `${t("colourKey.title")}, ${t("colourKey.count", { shown: shown.length, all: HIGHLIGHT_COLORS.length })}` : t("colourKey.title")}
            aria-expanded={popped}
            aria-controls={popped ? `${ids}-list` : undefined}
            onClick={() => setPopped((v) => !v)}
            className={cn(
              "flex size-9 items-center justify-center rounded-lg hover:bg-muted",
              popped && "bg-muted",
              focusRing,
            )}
          >
            <span aria-hidden className="grid grid-cols-2 gap-0.5">
              {HIGHLIGHT_COLORS.map((c) => (
                <span key={c} className="contents [&>span]:size-2.5">
                  {swatch(c, isShown(filter, c))}
                </span>
              ))}
            </span>
          </button>
        </Hint>
      </div>
      {popped && key}
    </div>
  );
}
