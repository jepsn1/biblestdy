import type { Translation } from "@biblestdy/shared";
import { translationInfo } from "@biblestdy/shared";
import { ChevronDown } from "lucide-react";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { ScrollArea } from "~/components/ui/scroll-area";
import { cn } from "~/lib/utils";
import type { CompareKit } from "./compare-loader";
import { filterTranslations, FILTER_FROM } from "./compare-picks";

/**
 * Compare's one compact control (#258): "Translations (2) ▾" opens a list
 * of checkboxes — the reading translation first, ticked and fixed, then the
 * others (filter-as-you-type from FILTER_FROM of them). Space ticks, the
 * arrows move, Escape closes back to the button. The button's name carries
 * the count of texts shown (the reading one too): "Compare translations, 2
 * selected".
 */
export function ComparePicker({
  current,
  others,
  picks,
  cap,
  onToggle,
  translationTitle,
  ui,
  className,
  kit,
}: {
  current: Translation;
  /** The other translations, in picker order. */
  others: Translation[];
  picks: string[];
  cap: number;
  onToggle: (id: string, on: boolean) => void;
  translationTitle: (tr: Translation) => string;
  ui: "en" | "da";
  className?: string;
  /** The popover parts come from the reader's chunk (see CompareKit). */
  kit: Pick<CompareKit, "Popover" | "PopoverContent" | "PopoverTitle" | "PopoverTrigger">;
}) {
  const { t } = useTranslation();
  const { Popover, PopoverContent, PopoverTitle, PopoverTrigger } = kit;
  const ids = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  const filtering = others.length >= FILTER_FROM;
  const describe = (tr: Translation) => translationInfo(tr.abbreviation)?.description[ui];
  const shown = filtering ? filterTranslations(others, query, (tr) => [tr.abbreviation, translationTitle(tr), describe(tr) ?? ""]) : others;
  const atCap = picks.length >= cap;
  // Texts shown, the reading one included: matches the ticks in the list
  const count = picks.length + 1;

  // Up/Down/Home/End between the ticks (Tab still walks them too)
  const boxes = () => [...(listRef.current?.querySelectorAll<HTMLElement>('[role="checkbox"]:not([data-disabled])') ?? [])];
  function onListKey(e: KeyboardEvent) {
    const all = boxes();
    if (!all.length) return;
    const at = all.indexOf(document.activeElement as HTMLElement);
    let next = -1;
    if (e.key === "ArrowDown") next = at < 0 ? 0 : Math.min(all.length - 1, at + 1);
    else if (e.key === "ArrowUp") {
      if (at <= 0 && filtering) {
        e.preventDefault();
        filterRef.current?.focus();
        return;
      }
      next = Math.max(0, at - 1);
    } else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = all.length - 1;
    else return;
    e.preventDefault();
    all[next]?.focus();
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            aria-label={t("compare.pickerName", { count })}
            className={cn("max-w-full gap-1.5 pointer-coarse:px-3", className)}
          />
        }
      >
        <span className="truncate">{t("compare.picker")}</span>
        <span className="shrink-0 rounded-full bg-muted px-1.5 text-meta font-semibold tabular-nums text-foreground">{count}</span>
        <ChevronDown className="size-4 shrink-0" aria-hidden />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        // Touch: never raise the keyboard on open (it would cover the list)
        initialFocus={() => (filtering && !window.matchMedia("(pointer: coarse)").matches ? filterRef.current : boxes()[0]) ?? true}
        className="w-[min(22rem,calc(100vw-2rem))] gap-0 p-0"
      >
        <PopoverTitle className="sr-only">{t("compare.title")}</PopoverTitle>
        {/* The reading translation: always shown, so ticked and fixed */}
        <label className="flex min-h-10 items-center gap-2.5 border-b border-border px-3 py-2 text-control pointer-coarse:min-h-11">
          {/* Fixed, not switched off: full strength, like the other ticks */}
          <Checkbox checked disabled className="data-disabled:cursor-default data-disabled:opacity-100" />
          <span className="min-w-0 flex-1">
            <span className="font-semibold">{current.abbreviation}</span> · {translationTitle(current)}
            <span className="block text-meta text-muted-foreground">{t("compare.readingNote")}</span>
          </span>
        </label>
        {filtering && (
          <div className="border-b border-border p-2">
            <label htmlFor={`${ids}-filter`} className="sr-only">
              {t("compare.filter")}
            </label>
            <Input
              ref={filterRef}
              id={`${ids}-filter`}
              type="search"
              autoComplete="off"
              placeholder={t("compare.filter")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  boxes()[0]?.focus();
                }
              }}
              className="pointer-coarse:h-11"
            />
          </div>
        )}
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- arrow keys between the ticks */}
        <div role="group" aria-labelledby={`${ids}-group`} onKeyDown={onListKey}>
          <span id={`${ids}-group`} className="sr-only">
            {t("compare.group")}
          </span>
          <ScrollArea viewportClassName="max-h-[min(18rem,40dvh,calc(var(--available-height)-9rem))]">
            <div ref={listRef} className="flex flex-col p-1">
              {shown.map((tr) => {
                const on = picks.includes(tr.id);
                const off = !on && atCap;
                const info = describe(tr);
                return (
                  <label
                    key={tr.id}
                    className={cn(
                      "flex min-h-10 cursor-pointer items-start gap-2.5 rounded-md px-2 py-2 text-control hover:bg-accent has-[:focus-visible]:bg-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring pointer-coarse:min-h-12",
                      off && "cursor-not-allowed opacity-60 hover:bg-transparent",
                    )}
                  >
                    <Checkbox className="mt-0.5" checked={on} disabled={off} onCheckedChange={(checked) => onToggle(tr.id, checked)} />
                    <span className="min-w-0 flex-1">
                      <span className="font-semibold">{tr.abbreviation}</span> · {translationTitle(tr)}
                      {info && <span className="block text-meta text-muted-foreground">{info}</span>}
                    </span>
                  </label>
                );
              })}
              {shown.length === 0 && <p className="px-2 py-3 text-control text-muted-foreground">{t("compare.noMatch")}</p>}
            </div>
          </ScrollArea>
          {cap < others.length && <p className="border-t border-border px-3 py-2 text-meta text-muted-foreground">{t("compare.cap", { n: cap })}</p>}
        </div>
        {/* A filter that finds nothing is said, not just shown */}
        <span role="status" className="sr-only">
          {filtering && shown.length === 0 ? t("compare.noMatch") : ""}
        </span>
      </PopoverContent>
    </Popover>
  );
}
