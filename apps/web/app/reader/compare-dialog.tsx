import type { BookLocale, Chapter, MappedSlice, ScriptureRef, Translation } from "@biblestdy/shared";
import { bookName, translationInfo } from "@biblestdy/shared";
import { mapRange, sourceRange, unionRange } from "@biblestdy/shared/versification";
import { useQueries } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "~/components/ui/dialog";
import { ScrollArea } from "~/components/ui/scroll-area";
import { bookLocale } from "~/lib/book-name";
import i18n from "~/lib/i18n";
// Its own words come with this chunk (bundle budget)
import "../locales/compare";
import { queryClient } from "~/lib/query";
import { cn } from "~/lib/utils";
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
import { ComparePicker } from "./compare-picker";
import { compareCap, initialPicks, readPicks, savePicks, togglePick } from "./compare-picks";
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
/** A phone on its side: the dialog, kept clear of the home indicator. */
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
 * drawer on phones; either way one compact picker on top, the texts right
 * under it (#258). Text comes through the reader's chapter cache and reading
 * quota (only ticked translations are fetched); one quiet foot links the copyright page
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
  const { chapterQuery, retryWhenLimited, groupTranslations, translationTitle, formatWait, Drawer, DrawerContent, DrawerTitle } = kit;
  labelOf = kit.referenceLabel;
  const ui = i18n.language.startsWith("da") ? "da" : "en";
  const isMobile = useMedia(PHONE);
  const short = useMedia(SHORT);
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

  function toggle(id: string, on: boolean) {
    const next = togglePick(picks, id, on, otherIds, cap);
    if (!next) return;
    setPicks(next);
    savePicks(next);
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
    queries: wanted.map(({ id, c }) => ({ ...chapterQuery(id, c), ...retryWhenLimited, enabled: open })),
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
  // One compact control (#258); the texts start right under it
  const picker = (
    <ComparePicker
      current={current}
      others={others}
      picks={picks}
      cap={cap}
      onToggle={toggle}
      translationTitle={translationTitle}
      ui={ui}
      kit={kit}
    />
  );

  // No visible title (#253): the dialog is still named for screen readers —
  // "Compare translations, John 3:16" — and takes focus on open
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

  const empty = picks.length === 0 && others.length > 0 && (
    <p className="mb-5 rounded-md border border-dashed border-border px-3 py-2 text-control text-muted-foreground">{t("compare.empty")}</p>
  );

  const foot = (
    <footer className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-t border-border px-4 py-2.5 sm:px-5">
      <ScriptureCredit className="min-w-0 flex-1" onFollow={() => onOpenChange(false)} />
      <Button variant="outline" size="sm" className="pointer-coarse:h-11" onClick={() => onOpenChange(false)}>
        {t("compare.close")}
      </Button>
    </footer>
  );

  // ---- phones: the picker beside Close, then the texts (#258) ----
  const closeX = (
    <Button variant="ghost" size="icon" className="size-11 shrink-0" aria-label={t("compare.close")} onClick={() => onOpenChange(false)}>
      <X className="size-5" aria-hidden />
    </Button>
  );
  const phone = (
    <>
      {/* Too narrow for both (200% text): Close goes up a row, the label stays whole */}
      <header className="flex shrink-0 flex-wrap-reverse items-center gap-x-2 border-b border-border py-1 pr-2 pl-4">
        {hiddenTitle}
        {picker}
        <span className="ml-auto">{closeX}</span>
      </header>
      <ScrollArea className="min-h-0 flex-1" data-base-ui-swipe-ignore="">
        <div className="px-4 pt-4 pb-6">
          {empty}
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
        {problems.join(" ")}
      </div>
      {open && tokens.map((tk) => <FumsView key={tk} token={tk} useFumsView={kit.useFumsView} />)}
    </>
  );

  const content = (
    <>
      {hiddenTitle}
      <div className="flex shrink-0 items-center border-b border-border px-4 py-2 sm:px-5">{picker}</div>
      {/* Swipes inside never close the drawer: only its header drags */}
      <ScrollArea className="min-h-0 flex-1" data-base-ui-swipe-ignore="">
        <div className="px-4 pt-5 pb-6 sm:px-5">
          {empty}
          {passages}
        </div>
      </ScrollArea>
      {foot}
      {live}
    </>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange} showSwipeHandle>
        <DrawerContent className="h-[92dvh] max-h-[92dvh]" initialFocus={titleRef} finalFocus={finalFocus}>
          {phone}
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
          // A short (landscape phone) screen: clear of the home indicator (#251)
          short && "top-[calc(0.5rem+var(--safe-top))] h-[calc(100dvh-1rem-var(--safe-top)-var(--safe-bottom))]",
        )}
      >
        {content}
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
