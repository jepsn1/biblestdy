import { HIGHLIGHT_COLORS, type HighlightColor } from "@biblestdy/shared";
import { ChevronDown } from "lucide-react";
import { useEffect, useId, useState } from "react";
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
 */
export function ColourKey() {
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

  return (
    <div
      role="group"
      aria-labelledby={`${ids}-title`}
      className="pointer-events-auto absolute bottom-3 left-3 z-20 flex max-w-[min(18rem,calc(100%-1.5rem))] flex-col rounded-[calc(var(--radius-md)+0.25rem+1px)] border border-border bg-background p-1 text-meta shadow-xs"
    >
      {/* Always mounted: a live region born with its text often isn't read */}
      <span role="status" className="sr-only">
        {status}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${ids}-list`}
          onClick={() => fold(!open)}
          className={cn(
            "flex h-7 items-center gap-1.5 rounded-md px-2 whitespace-nowrap text-muted-foreground hover:bg-muted hover:text-foreground",
            open && "min-w-0 flex-1",
            focusRing,
          )}
        >
          {!open && (
            <span aria-hidden className="flex -space-x-0.5">
              {HIGHLIGHT_COLORS.map((c) => (
                <span key={c} className="contents">
                  {swatch(c, isShown(filter, c))}
                </span>
              ))}
            </span>
          )}
          <span id={`${ids}-title`} className={cn("font-medium", open && "truncate")}>
            {t("colourKey.title")}
          </span>
          {/* Folded with a filter on: say so, so it isn't forgotten */}
          {!open && filter && <span className="shrink-0">{t("colourKey.count", { shown: shown.length, all: HIGHLIGHT_COLORS.length })}</span>}
          <ChevronDown aria-hidden className={cn("ml-auto size-3.5 shrink-0 transition-transform", open && "rotate-180")} />
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
      {open && (
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
}
