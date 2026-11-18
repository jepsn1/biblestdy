import type { BookLocale, Chapter, MappedSlice, ScriptureRef, Translation } from "@biblestdy/shared";
import { bookName, translationInfo } from "@biblestdy/shared";
import { mapRange, sourceRange, unionRange } from "@biblestdy/shared/versification";
import { useQueries } from "@tanstack/react-query";
import { Check, ChevronLeft, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Dialog, DialogContent, DialogTitle } from "~/components/ui/dialog";
import { ScrollArea } from "~/components/ui/scroll-area";
import { bookLocale } from "~/lib/book-name";
import i18n from "~/lib/i18n";
// Its own words come with this chunk (bundle budget)
import "../locales/compare";
import { queryClient } from "~/lib/query";
import { cn, focusTitle } from "~/lib/utils";
import type { CompareKit } from "./compare-loader";
import {
  blockView,
  fumsTokens,
  numberingDiffers,
  sliceChapters,
  type BlockNote,
  type BlockView,
  type ChapterRef,
  isLimited,
  type Loaded,
} from "./compare-blocks";
import { compareCap, firstStep, initialPicks, readPicks, savePicks, togglePick, type CompareStep } from "./compare-picks";
import type { CompareAnchor, CompareRange } from "./dialog-events";
import { PassageText } from "./passage-text";
import { ScriptureCredit } from "./scripture-credit";

/** A typed range never spans more than this many chapters (reading quota). */
const MAX_RANGE_CHAPTERS = 3;

/** "51:1" / "51,1–2" — a reference without its book (block notes). */
function shortRef(ref: ScriptureRef, locale: BookLocale): string {
  const sep = locale === "da" ? "," : ":";
  if (ref.verse === undefined) return String(ref.chapter);
  let out = `${ref.chapter}${sep}${ref.verse}`;
  if (ref.endChapter !== undefined && ref.endChapter !== ref.chapter) out += `–${ref.endChapter}${sep}${ref.endVerse}`;
  else if (ref.endVerse !== undefined && ref.endVerse !== ref.verse) out += `–${ref.endVerse}`;
  return out;
}

/** A reference in the UI language: "Salme 51,3" / "Psalm 51:1" (the
 * numbers are the translation's own). */
/** Set from the kit on render (see CompareKit). */
let labelOf: CompareKit["referenceLabel"] = () => "";
function ownLabel(ref: ScriptureRef): string {
  const locale = bookLocale(i18n.language);
  return labelOf(ref, (id) => bookName(id, locale), locale);
}

/** A media query, read while rendering (no first frame with the wrong
 * layout, and no fetch before the phone steps apply). */
function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (on) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", on);
      return () => mql.removeEventListener("change", on);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
/** use-mobile's breakpoint: a drawer below it. */
const PHONE = "(max-width: 767px)";
/** A phone on its side: the dialog, but too short for picker + passages. */
const SHORT = "(max-height: 600px)";

const keyOf = (id: string, c: ChapterRef) => `${id}/${c.book}.${c.chapter}`;

/** The asked passage before widening, in the reading translation. */
function baseRef(anchor: CompareAnchor | undefined, range: CompareRange | undefined, source: Chapter | undefined) {
  if (anchor) {
    if (source) return sourceRange(source, anchor);
    const ref: ScriptureRef = { book: anchor.book, chapter: anchor.chapter, verse: anchor.startVerse };
    if (anchor.endVerse > anchor.startVerse) ref.endVerse = anchor.endVerse;
    return { ref, bridged: false, partial: false };
  }
  const r = range!;
  const ref: ScriptureRef = { book: r.book, chapter: r.chapter };
  if (r.verse !== undefined) {
    ref.verse = r.verse;
    const endChapter = Math.min(r.endChapter ?? r.chapter, r.chapter + MAX_RANGE_CHAPTERS - 1);
    if (endChapter !== r.chapter) {
      ref.endChapter = endChapter;
      ref.endVerse = endChapter === (r.endChapter ?? r.chapter) ? r.endVerse : undefined;
    } else if (r.endVerse !== undefined) ref.endVerse = r.endVerse;
  }
  return { ref, bridged: false, partial: false };
}

/** Its chapters, in the reading translation. */
function refChapters(ref: ScriptureRef): ChapterRef[] {
  const out: ChapterRef[] = [];
  for (let c = ref.chapter; c <= (ref.endChapter ?? ref.chapter); c++) out.push({ book: ref.book, chapter: c });
  return out;
}

/** FUMS for one shown chapter (one per token, mounted while it shows). */
function FumsView({ token, useFumsView }: { token: string; useFumsView: CompareKit["useFumsView"] }) {
  useFumsView({ fumsToken: token });
  return null;
}


/**
 * Compare translations (#167): the passage in the reading translation, then
 * in each ticked one, stacked — just each translation's label and its words
 * (#253: no visible title, copy or jump). A modal dialog on desktop, a tall
 * drawer on phones in two steps — pick, then compare (#218). Text comes
 * through the reader's chapter cache and reading quota (nothing is fetched
 * before a translation is ticked); one quiet foot links the copyright page
 * and API.Bible, and every chapter shown is reported to FUMS once on screen.
 * Verses are matched through the versification map — never by number alone.
 */
export function CompareDialog({
  open,
  onOpenChange,
  anchor,
  range,
  finalFocus,
  translations,
  current,
  kit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchor?: CompareAnchor;
  range?: CompareRange;
  /** Where focus goes on close (false: the caller moves it). */
  finalFocus: () => HTMLElement | false;
  translations: Translation[];
  current: Translation;
  /** Reader helpers (see CompareKit). */
  kit: CompareKit;
}) {
  const { t, i18n } = useTranslation();
  const { chapterQuery, retryWhenLimited, groupTranslations, translationTitle, formatWait, useTextSize, Drawer, DrawerContent, DrawerTitle } = kit;
  labelOf = kit.referenceLabel;
  const ui = i18n.language.startsWith("da") ? "da" : "en";
  const isMobile = useMedia(PHONE);
  const short = useMedia(SHORT);
  const textSize = useTextSize();
  const ids = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);

  // Picker order: the chooser's (UI language first, most read first)
  const others = useMemo(
    () => groupTranslations(translations, ui).flatMap(([, items]) => items).filter((tr) => tr.id !== current.id),
    [translations, ui, current.id, groupTranslations],
  );
  const otherIds = useMemo(() => others.map((tr) => tr.id), [others]);
  const cap = compareCap(translations.length);
  const [picks, setPicks] = useState<string[]>(() => initialPicks(readPicks(), otherIds, cap));
  // Re-read on each open (another tab, or the reading translation changed)
  useEffect(() => {
    if (open) setPicks(initialPicks(readPicks(), otherIds, cap));
  }, [open, otherIds, cap]);

  // Phones (#218): two steps, so the passages get the height. Remembered
  // picks open on the passages; first open on the picker. Set while
  // rendering the open, so the drawer never shows the wrong step first.
  const stepped = isMobile || short;
  const [step, setStep] = useState<CompareStep>(() => firstStep(readPicks(), otherIds, cap));
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setStep(firstStep(readPicks(), otherIds, cap));
  }
  const showPassages = !stepped || step === "compare";
  // A step change moves focus to its heading (the drawer focuses it on open)
  const stepMoved = useRef(false);
  useEffect(() => {
    if (!stepMoved.current) return;
    stepMoved.current = false;
    titleRef.current?.focus();
  }, [step]);
  function goTo(next: CompareStep) {
    stepMoved.current = true;
    setStep(next);
  }

  function toggle(id: string, on: boolean) {
    const next = togglePick(picks, id, on, otherIds, cap);
    if (!next) return;
    setPicks(next);
    // Phones remember the picks on Compare, not on each tick
    if (!stepped) savePicks(next);
  }
  function compareNow() {
    if (!picks.length) return;
    savePicks(picks);
    goTo("compare");
  }
  const picked = others.filter((tr) => picks.includes(tr.id));

  // ---- what to show ----
  const cached = (id: string, c: ChapterRef) =>
    queryClient.getQueryData<Chapter>(chapterQuery(id, c).queryKey);
  const sourceChapterRef = anchor ? { book: anchor.book, chapter: anchor.chapter } : range ? { book: range.book, chapter: range.chapter } : null;
  const source = sourceChapterRef ? cached(current.id, sourceChapterRef) : undefined;
  const base = useMemo(() => (anchor || range ? baseRef(anchor, range, source) : null), [anchor, range, source]);

  // Widen to whole units in every ticked translation (chapters as they arrive)
  const loadedOf = (tr: Translation, slices: MappedSlice[]) =>
    sliceChapters(slices).flatMap((c) => {
      const ch = cached(tr.id, c);
      return ch ? [ch] : [];
    });
  const sourceChapters = base ? refChapters(base.ref).flatMap((c) => cached(current.id, c) ?? []) : [];
  const first = base ? picked.map((tr) => ({ tr, slices: mapRange(base.ref, current.abbreviation, tr.abbreviation) })) : [];
  const union = base
    ? unionRange(
        base.ref,
        current.abbreviation,
        first.map(({ tr, slices }) => ({ numbering: tr.abbreviation, chapters: loadedOf(tr, slices) })),
        sourceChapters,
      )
    : null;
  const ref = union?.ref ?? null;
  const shown = [current, ...picked];
  const plans = ref
    ? shown.map((tr) => {
        const slices = mapRange(ref, current.abbreviation, tr.abbreviation);
        const before = first.find((f) => f.tr.id === tr.id)?.slices ?? [];
        const chapters = [...sliceChapters(before), ...sliceChapters(slices)].filter(
          (c, i, all) => all.findIndex((x) => x.book === c.book && x.chapter === c.chapter) === i,
        );
        return { tr, slices, chapters };
      })
    : [];
  // The source chapter itself (bridges + whole verses) even before a plan
  const wanted: { id: string; c: ChapterRef }[] = [
    ...(base ? refChapters(base.ref) : sourceChapterRef ? [sourceChapterRef] : []).map((c) => ({ id: current.id, c })),
    ...plans.flatMap((p) => p.chapters.map((c) => ({ id: p.tr.id, c }))),
  ].filter((w, i, all) => all.findIndex((x) => keyOf(x.id, x.c) === keyOf(w.id, w.c)) === i);

  const results = useQueries({
    // Nothing is fetched while picking (reading quota)
    queries: wanted.map(({ id, c }) => ({ ...chapterQuery(id, c), ...retryWhenLimited, enabled: open && (showPassages || id === current.id) })),
  });
  const state = new Map<string, Loaded>();
  wanted.forEach((w, i) => {
    const r = results[i];
    state.set(
      keyOf(w.id, w.c),
      r.data
        ? { status: "ok", chapter: r.data }
        : r.status === "error"
          ? { status: "error", error: r.error }
          : { status: "pending", limited: isLimited(r.failureReason) },
    );
  });
  const retry = (id: string, chapters: ChapterRef[]) => {
    wanted.forEach((w, i) => {
      if (w.id === id && chapters.some((c) => keyOf(id, c) === keyOf(w.id, w.c)) && results[i].status === "error") void results[i].refetch();
    });
  };

  const blocks = plans.map((p) => ({
    ...p,
    view: blockView(p.slices, (c) => state.get(keyOf(p.tr.id, c)) ?? { status: "pending" }),
  }));
  const tokens = fumsTokens(blocks.map((b) => b.view));

  // A mapped chapter that 404'd: say so in the block, and log it
  const missingKey = blocks
    .flatMap((b) => (b.view.kind === "ready" ? b.view.missing.map((m) => `${b.tr.abbreviation} ${m.book} ${m.chapter}`) : []))
    .join("|");
  useEffect(() => {
    if (missingKey) console.error("[compare] mapped chapter not found:", missingKey);
  }, [missingKey]);

  // ---- labels ----
  const curLocale = bookLocale(i18n.language);
  const title = base ? ownLabel(base.ref) : "";
  const problems = blocks.flatMap(({ tr, view }) => (view.kind === "problem" ? [problemText(view, tr.abbreviation)] : []));
  function problemText(view: Extract<BlockView, { kind: "problem" }>, abbr: string) {
    if (view.error === "daily") return t("compare.daily", { abbr });
    if (view.error === "limited-long") return t("compare.limited", { abbr, wait: formatWait(t, view.wait ?? 60) });
    return t("compare.failed", { abbr });
  }
  function noteText(n: BlockNote, tr: Translation) {
    switch (n.kind) {
      case "renumbered":
        return t("compare.renumbered", { ref: shortRef(n.source, curLocale), abbr: current.abbreviation });
      case "moved":
        return t("compare.moved", { ref: ownLabel(n.ref) });
      case "absent":
        return t("compare.absent", { n: n.verses.join(", ") });
      case "psalmTitle":
        return t("compare.psalmTitle");
      case "unmapped":
        return t("compare.unmapped");
    }
  }

  // ---- parts ----
  const pinned = textSize <= 125;
  const readingRow = (
    <div className="flex items-center gap-2 rounded-md bg-accent px-3 py-2 text-control text-accent-foreground">
      <Check className="size-4 shrink-0" strokeWidth={2.5} aria-hidden />
      <span>{t("compare.reading", { abbr: current.abbreviation, name: translationTitle(current) })}</span>
    </div>
  );
  const atCap = picks.length >= cap;
  const picker = (
    <div className="flex flex-col gap-2">
      {readingRow}
      {others.length > 0 && (
        <div role="group" aria-labelledby={`${ids}-group`} className="flex flex-col gap-1.5">
          <span id={`${ids}-group`} className="text-control font-medium">
            {t("compare.group")}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {others.map((tr) => {
              const on = picks.includes(tr.id);
              const info = translationInfo(tr.abbreviation);
              return (
                <label
                  key={tr.id}
                  className={cn(
                    "flex min-h-9 cursor-pointer items-center gap-2 rounded-md border border-border px-2.5 py-1 text-control has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring pointer-coarse:min-h-11",
                    on && "border-foreground/40",
                    !on && atCap && "cursor-not-allowed opacity-60",
                  )}
                >
                  <Checkbox
                    checked={on}
                    disabled={!on && atCap}
                    onCheckedChange={(checked) => toggle(tr.id, checked)}
                  />
                  <span className="font-semibold">{tr.abbreviation}</span>
                  {info && <span className="text-muted-foreground">{info.description[ui]}</span>}
                </label>
              );
            })}
          </div>
          {cap < others.length && <p className="text-meta text-muted-foreground">{t("compare.cap", { n: cap })}</p>}
        </div>
      )}
    </div>
  );

  // No visible title (#253): the dialog is still named for screen readers —
  // "Compare translations, John 3:16" — and takes focus on open / step change
  const Title = isMobile ? DrawerTitle : DialogTitle;
  const hiddenTitle = (
    <Title ref={titleRef} tabIndex={-1} className="sr-only">
      {title ? `${t("compare.title")}, ${title}` : t("compare.title")}
    </Title>
  );

  const passages = blocks.map(({ tr, slices, view }, i) => (
    <CompareBlock
      key={tr.id}
      first={i === 0}
      tr={tr}
      slices={slices}
      view={view}
      noteText={(n) => noteText(n, tr)}
      problem={view.kind === "problem" ? problemText(view, tr.abbreviation) : null}
      onRetry={() => retry(tr.id, sliceChapters(slices))}
      kit={kit}
    />
  ));
  const credit = <ScriptureCredit onFollow={() => onOpenChange(false)} />;

  // Desktop + tablet: one step, picker on top, the passages, one quiet foot
  const body = (
    <>
      {!pinned && <div className="pb-5">{picker}</div>}
      {picks.length === 0 && others.length > 0 && (
        <p className="mb-5 rounded-md border border-dashed border-border px-3 py-2 text-control text-muted-foreground">{t("compare.empty")}</p>
      )}
      {passages}
    </>
  );

  const foot = (
    <footer className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-t border-border px-4 py-2.5 sm:px-5 pb-[max(env(safe-area-inset-bottom),0.625rem)]">
      <ScriptureCredit className="min-w-0 flex-1" onFollow={() => onOpenChange(false)} />
      <Button variant="outline" size="sm" className="pointer-coarse:h-11" onClick={() => onOpenChange(false)}>
        {t("compare.close")}
      </Button>
    </footer>
  );

  // ---- phone steps (#218) ----
  const iconButton = "size-11 shrink-0";
  const closeX = (
    <Button variant="ghost" size="icon" className={iconButton} aria-label={t("compare.close")} onClick={() => onOpenChange(false)}>
      <X className="size-5" aria-hidden />
    </Button>
  );
  const titleClass = cn("font-serif text-title leading-tight font-semibold text-foreground", focusTitle);
  const pickStep = (
    <>
      <header className="flex shrink-0 items-start gap-2 border-b border-border py-2 pr-2 pl-4">
        <div className="min-w-0 flex-1 pt-1.5">
          <p className="eyebrow">{title}</p>
          <Title ref={titleRef} tabIndex={-1} className={titleClass}>
            {t("compare.choose")}
          </Title>
        </div>
        {closeX}
      </header>
      <ScrollArea className="min-h-0 flex-1" data-base-ui-swipe-ignore="">
        <div className="flex flex-col gap-3 px-4 pt-4 pb-6">
          {readingRow}
          {others.length > 0 && (
            <div role="group" aria-labelledby={`${ids}-group`} className="flex flex-col gap-2">
              <span id={`${ids}-group`} className="text-control font-medium">
                {t("compare.group")}
              </span>
              {others.map((tr) => {
                const on = picks.includes(tr.id);
                const info = translationInfo(tr.abbreviation);
                return (
                  <label
                    key={tr.id}
                    className={cn(
                      "flex min-h-11 cursor-pointer items-start gap-3 rounded-md border border-border px-3 py-2.5 text-control has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                      on && "border-foreground/40",
                      !on && atCap && "cursor-not-allowed opacity-60",
                    )}
                  >
                    <Checkbox className="mt-0.5" checked={on} disabled={!on && atCap} onCheckedChange={(checked) => toggle(tr.id, checked)} />
                    <span className="min-w-0 flex-1">
                      <span className="block">
                        <span className="font-semibold">{tr.abbreviation}</span> · {translationTitle(tr)}
                      </span>
                      {info && <span className="block text-meta text-muted-foreground">{info.description[ui]}</span>}
                    </span>
                  </label>
                );
              })}
              {cap < others.length && <p className="text-meta text-muted-foreground">{t("compare.cap", { n: cap })}</p>}
            </div>
          )}
        </div>
      </ScrollArea>
      <footer className="flex shrink-0 flex-col gap-2 border-t border-border px-4 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
        {picks.length === 0 && (
          <p id={`${ids}-empty`} className="text-control text-muted-foreground">
            {t("compare.empty")}
          </p>
        )}
        <Button
          className="h-11 w-full"
          disabled={picks.length === 0}
          aria-describedby={picks.length === 0 ? `${ids}-empty` : undefined}
          onClick={compareNow}
        >
          {t("compare.go")}
        </Button>
      </footer>
    </>
  );
  const compareStep = (
    <>
      <header className="flex shrink-0 items-center gap-1 border-b border-border px-2 py-1">
        {hiddenTitle}
        {/* Wraps at 200% so Close stays on screen */}
        <Button variant="ghost" className="h-auto min-h-11 min-w-0 shrink gap-1 px-2 text-left whitespace-normal" onClick={() => goTo("pick")}>
          <ChevronLeft className="size-5" aria-hidden />
          {t("compare.change")}
        </Button>
        <span className="flex-1" />
        {closeX}
      </header>
      <ScrollArea className="min-h-0 flex-1" data-base-ui-swipe-ignore="">
        <div className="px-4 pt-4 pb-[max(env(safe-area-inset-bottom),1.5rem)]">
          {passages}
          {/* The credit closes the scroll, not a tall footer */}
          <div className="mt-6 border-t border-foreground/12 pt-4">{credit}</div>
        </div>
      </ScrollArea>
    </>
  );

  const live = (
    <>
      {/* Problems only, always naming the translation */}
      <div aria-live="polite" className="sr-only">
        {showPassages ? problems.join(" ") : ""}
      </div>
      {open && showPassages && tokens.map((tk) => <FumsView key={tk} token={tk} useFumsView={kit.useFumsView} />)}
    </>
  );

  const content = (
    <>
      {hiddenTitle}
      {pinned && <div className="shrink-0 border-b border-border px-4 py-3 sm:px-5">{picker}</div>}
      {/* Swipes inside never close the drawer: only its header drags */}
      <ScrollArea className="min-h-0 flex-1" data-base-ui-swipe-ignore="">
        <div className="px-4 pt-5 pb-6 sm:px-5">{body}</div>
      </ScrollArea>
      {foot}
      {live}
    </>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange} showSwipeHandle>
        <DrawerContent className="h-[92dvh] max-h-[92dvh]" initialFocus={titleRef} finalFocus={finalFocus}>
          {step === "pick" ? pickStep : compareStep}
          {live}
        </DrawerContent>
      </Drawer>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        initialFocus={titleRef}
        finalFocus={finalFocus}
        className={cn(
          "top-[8dvh] flex h-[min(84dvh,56rem)] w-[min(40rem,calc(100vw-2rem))] max-w-none translate-y-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-none",
          short && "top-2 h-[calc(100dvh-1rem)]",
        )}
      >
        {stepped ? (
          <>
            {step === "pick" ? pickStep : compareStep}
            {live}
          </>
        ) : (
          content
        )}
      </DialogContent>
    </Dialog>
  );
}

/** One translation: its abbreviation (the full name for screen readers),
 * its own reference only where the numbering differs, any numbering notes,
 * then the words. */
function CompareBlock({
  first,
  tr,
  slices,
  view,
  noteText,
  problem,
  onRetry,
  kit,
}: {
  first: boolean;
  tr: Translation;
  slices: MappedSlice[];
  view: BlockView;
  noteText: (n: BlockNote) => string;
  problem: string | null;
  onRetry: () => void;
  kit: CompareKit;
}) {
  const { t } = useTranslation();
  const hid = useId();
  const { translationTitle, passageLines, showVerses } = kit;
  const locale = bookLocale(i18n.language);
  const own = view.kind === "ready" && view.ref && numberingDiffers(slices) ? ownLabel(view.ref) : null;
  const notes = view.kind === "ready" ? view.notes : [];

  return (
    <section
      aria-labelledby={hid}
      aria-busy={view.kind === "loading" || undefined}
      className={cn("[contain-intrinsic-size:auto_12rem] [content-visibility:auto]", !first && "mt-8 border-t border-foreground/12 pt-6 max-sm:mt-7 max-sm:pt-5")}
    >
      <h3 id={hid} className="mb-2 flex flex-wrap items-baseline gap-x-2 font-sans text-meta">
        <span className="font-semibold tracking-[0.06em]">{tr.abbreviation}</span>
        <span className="sr-only">, {translationTitle(tr)}</span>
        {own && <span className="text-muted-foreground">{own}</span>}
      </h3>
      {notes.length > 0 && (
        <div className="mb-2 font-sans">
          {notes.map((n) => (
            <p key={n.kind} className="text-meta text-muted-foreground">
              {noteText(n)}
            </p>
          ))}
        </div>
      )}

      {view.kind === "loading" && (
        <div>
          {view.limited && <p className="mb-2 text-control text-muted-foreground">{t("compare.loading", { abbr: tr.abbreviation })}</p>}
          <BlockSkeleton verses={view.verses} />
        </div>
      )}
      {view.kind === "problem" && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2">
          <p className="min-w-0 flex-1 text-control">{problem}</p>
          {view.error === "failed" && (
            <Button variant="outline" size="sm" className="pointer-coarse:h-11" onClick={onRetry}>
              {t("compare.retry")}
            </Button>
          )}
        </div>
      )}
      {view.kind === "ready" && view.parts.length > 0 && (
        <PassageText passageLines={passageLines} showVerses={showVerses} parts={view.parts} language={tr.language} numberSep={locale === "da" ? "," : ":"} />
      )}
    </section>
  );
}

/** Lines sized from the verse count (em, like the text); still under
 * reduced motion. */
function BlockSkeleton({ verses }: { verses: number }) {
  const lines = Math.min(12, Math.max(2, Math.round(verses * 1.8)));
  return (
    <div aria-hidden className="font-serif text-reading leading-[1.6]">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="flex h-[1.6em] items-center">
          <div
            className="h-[0.7em] animate-pulse rounded bg-muted motion-reduce:animate-none"
            style={{ width: i === lines - 1 ? "55%" : `${92 - ((i * 7) % 15)}%` }}
          />
        </div>
      ))}
    </div>
  );
}
