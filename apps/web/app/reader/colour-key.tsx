import { HIGHLIGHT_COLORS, HIGHLIGHT_LABEL_MAX, type HighlightColor } from "@biblestdy/shared";
import { ChevronDown, Tag } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Hint } from "~/components/hint";
import { useTranslation } from "react-i18next";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { ScrollArea } from "~/components/ui/scroll-area";
import { isShown, setHighlightFilter, toggleColor, useHighlightFilter, type HighlightFilter } from "~/lib/highlight-filter";
import { cleanLabels, saveHighlightLabels, upFirst, useColorName, useHighlightLabels } from "~/lib/highlight-labels";
import { notifyError } from "~/lib/notify";
import { cn, focusRing } from "~/lib/utils";
import { HIGHLIGHT_SWATCH } from "./highlight-colors";

const OPEN_KEY = "colourKeyOpen";

/** Marks the key, so the tool palette keeps its colours clear of it. */
export const COLOUR_KEY_ATTR = "data-colour-key";
/** Marks the tool palette, so the key never grows over its tools. */
export const TOOL_PALETTE_ATTR = "data-tool-palette";

/**
 * The colour key (bottom-left of the sheet, on the palette's left line): the
 * one place the colours have words. Picking a colour to highlight with is
 * the palette's job; the key
 * - says what each colour means ("blue = God speaking"), and names them in
 *   place ("Name colours…": its rows turn into fields) — where the names
 *   show; Settings keeps a dialog for phones;
 * - filters: click a colour to bring its highlights forward (the rest turn
 *   see-through), click others to add or drop them, "Show all" to reset.
 * Always there on desktop; folded to a chip until a colour is named, unless
 * the reader opened it — the fold is remembered on this device, the filter
 * only for the session.
 * Never over the text or the running foot: where the key doesn't fit in the
 * margin left of the text (`room`), it shrinks to a swatch button in the
 * palette's gutter that opens the key on demand, over the page until put away.
 * Never over the palette's tools or the foot's Previous either (large text on
 * a short screen): in the margin it grows up only to the palette, opened from
 * the gutter it sits above the foot — and past that its rows scroll.
 */
export function ColourKey({ room }: { room?: number }) {
  const { t } = useTranslation();
  const ids = useId();
  const labels = useHighlightLabels();
  const { title } = useColorName();
  const filter = useHighlightFilter();
  // The reader's own fold, once they chose one; else open once a colour is named
  const [fold, setFold] = useState<boolean | null>(null);
  useEffect(() => {
    try {
      const v = localStorage.getItem(OPEN_KEY);
      if (v) setFold(v === "1");
    } catch {
      // storage blocked: follows the names
    }
  }, []);
  const [editing, setEditing] = useState(false);
  const open = editing || (fold ?? Object.keys(labels).length > 0);
  /** Said once by the live region (names saved), until the next action. */
  const [said, setSaid] = useState<string | null>(null);
  const nameRef = useRef<HTMLButtonElement>(null);
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
    // Not while naming: the fields' width mustn't send the key to the gutter
    if ((tight && !popped) || editing) return;
    const w = keyRef.current?.offsetWidth ?? 0;
    setNatural((n) => (n === w ? n : w));
  }, [tight, popped, open, labels, filter, room, editing]);
  useEffect(() => {
    if (!tight) setPopped(false);
  }, [tight]);
  // Where the open key may reach (px): its top stays under the palette; from
  // the gutter it lifts clear of the running foot. Measured, as both move
  // with text size and the pane
  const [reach, setReach] = useState<{ maxHeight?: number; lift: number }>({ lift: 0 });
  const shownOpen = editing || (tight ? popped : open);
  useLayoutEffect(() => {
    const base = tight ? wrapRef.current : keyRef.current;
    const pane = base?.offsetParent as HTMLElement | null | undefined;
    if (!base || !pane || !shownOpen) return setReach((r) => (r.maxHeight === undefined && r.lift === 0 ? r : { lift: 0 }));
    const measure = () => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const bottom = base.getBoundingClientRect().bottom;
      const palette = pane.querySelector<HTMLElement>(`[${TOOL_PALETTE_ATTR}]`);
      const foot = pane.querySelector<HTMLElement>('[data-turn-still="foot"]');
      const paneTop = pane.getBoundingClientRect().top;
      // From the gutter (beside the palette, not under it): above the foot
      const lift = tight && foot ? Math.max(0, bottom - foot.getBoundingClientRect().top + 0.5 * rem) : 0;
      const ceiling = tight ? paneTop + 0.75 * rem : (palette?.getBoundingClientRect().bottom ?? paneTop) + 0.75 * rem;
      const maxHeight = Math.max(4 * rem, Math.floor(bottom - lift - ceiling));
      setReach((r) => (r.maxHeight === maxHeight && r.lift === lift ? r : { maxHeight, lift }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(pane);
    for (const el of pane.querySelectorAll<HTMLElement>(`[${TOOL_PALETTE_ATTR}], [data-turn-still="foot"]`)) observer.observe(el);
    return () => observer.disconnect();
  }, [tight, shownOpen]);
  useEffect(() => {
    if (!popped) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setPopped(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [popped]);
  function toggleOpen(next: boolean) {
    setFold(next);
    try {
      localStorage.setItem(OPEN_KEY, next ? "1" : "0");
    } catch {
      // storage blocked: this session only
    }
  }

  function stopEditing(saved: boolean) {
    setEditing(false);
    setSaid(saved ? t("colourKey.saved") : null);
    // Back to the button that opened the fields (rendered again next frame)
    requestAnimationFrame(() => nameRef.current?.focus());
  }
  function filterBy(next: HighlightFilter) {
    setSaid(null);
    setHighlightFilter(next);
  }

  const shown = HIGHLIGHT_COLORS.filter((c) => isShown(filter, c));
  const status =
    said ??
    (filter ? t("colourKey.showing", { colors: shown.map(title).join(", ") }) : t("colourKey.showingAll"));
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
      {...(!tight && { [COLOUR_KEY_ATTR]: "" })}
      className={cn(
        "pointer-events-auto flex flex-col rounded-[calc(var(--radius-md)+0.25rem+1px)] border border-border bg-background p-1 text-meta shadow-xs",
        tight
          ? "absolute bottom-0 left-full ml-2 w-max max-w-[18rem] shadow-md"
          : "absolute bottom-reader-inset left-reader-inset z-20 max-w-[min(18rem,calc(100%-2*var(--spacing-reader-inset)))]",
        // Naming: room for the fields, over the page while it lasts
        editing && "w-72 max-w-[calc(100vw-2rem)]",
      )}
      style={{ maxHeight: reach.maxHeight, ...(tight && reach.lift > 0 && { bottom: reach.lift }) }}
    >
      {!tight && live}
      {editing ? (
        <ScrollArea className={ROWS_SCROLL}>
          <NamesForm titleId={`${ids}-title`} onDone={stopEditing} />
        </ScrollArea>
      ) : (
        <>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-expanded={listed}
              aria-controls={`${ids}-list`}
              onClick={() => (tight ? putAway() : toggleOpen(!open))}
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
                onClick={() => filterBy(null)}
                className={cn("h-7 shrink-0 rounded-md px-2 font-medium hover:bg-muted", focusRing)}
              >
                {t("colourKey.showAll")}
              </button>
            )}
          </div>
          {listed && (
            <ScrollArea className={ROWS_SCROLL}>
            <ul id={`${ids}-list`} className="flex flex-col p-0.5">
              {HIGHLIGHT_COLORS.map((c) => {
                const on = isShown(filter, c);
                return (
                  <li key={c}>
                    {/* What a click does, in words: it filters, never highlights */}
                    <Hint label={filterHint(t, filter, on)} side="right">
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() => filterBy(toggleColor(filter, c))}
                        className={cn(
                          "flex h-7 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left hover:bg-muted",
                          !on && "text-muted-foreground",
                          focusRing,
                        )}
                      >
                        {swatch(c, on)}
                        <span className="truncate">{title(c)}</span>
                      </button>
                    </Hint>
                  </li>
                );
              })}
              {/* Naming lives with the names; quiet, as most never rename */}
              <li className="mt-0.5 border-t border-border pt-0.5">
                <button
                  ref={nameRef}
                  type="button"
                  onClick={() => {
                    setSaid(null);
                    setEditing(true);
                  }}
                  className={cn(
                    "flex h-7 w-full items-center gap-2 rounded-md px-2 text-left whitespace-nowrap text-muted-foreground hover:bg-muted hover:text-foreground",
                    focusRing,
                  )}
                >
                  <Tag aria-hidden className="size-3.5 shrink-0" />
                  {t("colorNames.open")}
                </button>
              </li>
            </ul>
            </ScrollArea>
          )}
        </>
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
      {...{ [COLOUR_KEY_ATTR]: "" }}
      className="pointer-events-auto absolute bottom-reader-inset left-reader-inset z-20"
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

/** The key's rows (or name fields) under a capped key: they take what's
 * left under the title and scroll past it. */
const ROWS_SCROLL = "flex min-h-0 flex-col [&>[data-slot=scroll-area-viewport]]:min-h-0";

/** What a click on a key row does — in words, for the mouse reader. */
function filterHint(t: (key: string) => string, filter: HighlightFilter, on: boolean): string {
  if (!filter) return t("colourKey.focusOne");
  return t(on ? "colourKey.fade" : "colourKey.bringBack");
}

/** The key's rows as fields: each colour's swatch and its name to type.
 * Enter saves, Esc cancels; an empty field = the colour's own name again. */
function NamesForm({ titleId, onDone }: { titleId: string; onDone: (saved: boolean) => void }) {
  const { t } = useTranslation();
  const ids = useId();
  const saved = useHighlightLabels();
  const [draft, setDraft] = useState<Partial<Record<HighlightColor, string>>>(() => ({ ...saved }));
  const busy = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const form = formRef.current;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault(); // not the reader's Esc (puts a tool down)
      e.stopPropagation(); // nor the gutter key's (puts the key away)
      done.current(false);
    };
    form?.addEventListener("keydown", onKey);
    return () => form?.removeEventListener("keydown", onKey);
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy.current) return;
    busy.current = true;
    const next = cleanLabels(draft);
    const save = () =>
      saveHighlightLabels(next).catch((err: unknown) => notifyError(err, { retry: save }));
    void save().finally(() => (busy.current = false));
    onDone(true); // the names show at once; a failed save says so and reverts
  }

  return (
    <form
      ref={formRef}
      onSubmit={submit}
      className="flex flex-col gap-1.5"
    >
      <div className="px-2 pt-1">
        <p id={titleId} className="font-medium">
          {t("colorNames.title")}
        </p>
        <p id={`${ids}-hint`} className="text-muted-foreground">
          {t("colourKey.nameHint")}
        </p>
      </div>
      <ul className="flex flex-col gap-1 px-1">
        {HIGHLIGHT_COLORS.map((c, i) => {
          const own = upFirst(t(`menu.colors.${c}`));
          return (
            <li key={c} className="flex items-center gap-2">
              <span
                aria-hidden
                className="size-3.5 shrink-0 rounded-full ring-1 ring-foreground/15"
                style={{ background: HIGHLIGHT_SWATCH[c] }}
              />
              <Input
                // Asked for to type in: the first field takes focus
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus={i === 0}
                aria-label={t("colourKey.nameFor", { color: own })}
                aria-describedby={`${ids}-hint`}
                value={draft[c] ?? ""}
                placeholder={own}
                maxLength={HIGHLIGHT_LABEL_MAX}
                autoComplete="off"
                onChange={(e) => setDraft((d) => ({ ...d, [c]: e.target.value }))}
                className="h-8 px-2"
              />
            </li>
          );
        })}
      </ul>
      <div className="flex justify-end gap-1">
        <Button type="button" variant="ghost" size="sm" onClick={() => onDone(false)}>
          {t("colorNames.cancel")}
        </Button>
        <Button type="submit" size="sm">
          {t("colorNames.save")}
        </Button>
      </div>
    </form>
  );
}
