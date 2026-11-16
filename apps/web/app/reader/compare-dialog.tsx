import type { BookLocale, Chapter, MappedSlice, ScriptureRef, Translation } from "@biblestdy/shared";
import { bookName, translationInfo } from "@biblestdy/shared";
import { mapRange, sourceRange, unionRange } from "@biblestdy/shared/versification";
import { useQueries } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Dialog, DialogContent, DialogTitle } from "~/components/ui/dialog";
import { Drawer, DrawerContent, DrawerTitle } from "~/components/lazy-drawer";
import { ScrollArea } from "~/components/ui/scroll-area";
import { useIsMobile } from "~/hooks/use-mobile";
import { bookLocale } from "~/lib/book-name";
import { useFumsView } from "~/lib/fums";
import { MAX_COPY_VERSES } from "~/lib/licence-limits";
import { notifyCopyFailed, notifyCopyLimit } from "~/lib/notify";
import { queryClient } from "~/lib/query";
import { referenceLabel } from "~/lib/reference-label";
import { useTextSize } from "~/lib/text-size";
import { cn, focusTitle } from "~/lib/utils";
import { chapterQuery, retryWhenLimited } from "./chapter-cache";
import { versesCopy } from "./chapter-layout";
import {
  blockView,
  canCopyAll,
  copyAllCount,
  formatCopyAll,
  fumsTokens,
  jumpTarget,
  numberingDiffers,
  partsVerseCount,
  sliceChapters,
  type BlockNote,
  type BlockView,
  type ChapterRef,
  type Loaded,
} from "./compare-blocks";
import { compareCap, initialPicks, readPicks, savePicks, togglePick } from "./compare-picks";
import type { CompareAnchor, CompareRange } from "./dialog-events";
import { PassageText } from "./passage-text";
import { formatWait, ReadingLimited } from "./reading-limit";
import { groupTranslations, translationTitle } from "./translation-chooser";
import { ScriptureCredit } from "./scripture-credit";

/** Where Continue in / Back go: a chapter, and the verse there if known. */
export type Place = { book: string; chapter: number; verse?: number };

/** A typed range never spans more than this many chapters (reading quota). */
const MAX_RANGE_CHAPTERS = 3;

/** "51:1" / "51,1–2" — a reference without its book (header notes). */
function shortRef(ref: ScriptureRef, locale: BookLocale): string {
  const sep = locale === "da" ? "," : ":";
  if (ref.verse === undefined) return String(ref.chapter);
  let out = `${ref.chapter}${sep}${ref.verse}`;
  if (ref.endChapter !== undefined && ref.endChapter !== ref.chapter) out += `–${ref.endChapter}${sep}${ref.endVerse}`;
  else if (ref.endVerse !== undefined && ref.endVerse !== ref.verse) out += `–${ref.endVerse}`;
  return out;
}

/** A reference in a translation's own style: "Salme 51,3" / "Psalm 51:1". */
function ownLabel(ref: ScriptureRef, language: string): string {
  const locale = bookLocale(language);
  return referenceLabel(ref, (id) => bookName(id, locale), locale);
}

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

async function writeClipboard(text: string, html: string): Promise<boolean> {
  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/plain": new Blob([text], { type: "text/plain" }),
        "text/html": new Blob([html], { type: "text/html" }),
      }),
    ]);
    return true;
  } catch {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      notifyCopyFailed(e);
      return false;
    }
  }
}

/** FUMS for one shown chapter (one per token, mounted while it shows). */
function FumsView({ token }: { token: string }) {
  useFumsView({ fumsToken: token });
  return null;
}


/**
 * Compare translations (#167): the passage in the reading translation, then
 * in each ticked one, stacked. A modal dialog on desktop, a tall drawer on
 * phones. Text comes through the reader's chapter cache and reading quota
 * (nothing is fetched before a translation is ticked); each block carries
 * its chapter's copyright line, the foot the API.Bible credit, and every
 * chapter shown is reported to FUMS once on screen. Verses are matched
 * through the versification map — never by number alone.
 */
export function CompareDialog({
  open,
  onOpenChange,
  anchor,
  range,
  finalFocus,
  translations,
  current,
  switchTranslation,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchor?: CompareAnchor;
  range?: CompareRange;
  /** Where focus goes on every close but a jump (false: the caller moves it). */
  finalFocus: () => HTMLElement | false;
  translations: Translation[];
  current: Translation;
  /** Switch the reading translation, landing on `to` (its own numbering). */
  switchTranslation: (id: string, to: { book: string; chapter: number; verse: number }, opts: { long: boolean }) => unknown;
}) {
  const { t, i18n } = useTranslation();
  const ui = i18n.language.startsWith("da") ? "da" : "en";
  const isMobile = useIsMobile();
  const textSize = useTextSize();
  const ids = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const jumped = useRef(false);
  useEffect(() => {
    if (open) jumped.current = false;
  }, [open]);

  // Picker order: the chooser's (UI language first, most read first)
  const others = useMemo(
    () => groupTranslations(translations, ui).flatMap(([, items]) => items).filter((tr) => tr.id !== current.id),
    [translations, ui, current.id],
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
  // Who widened it ("one verse unit in BPH")
  const widenedBy =
    base && union?.widened
      ? (picked.find((tr) =>
          unionRange(base.ref, current.abbreviation, [{ numbering: tr.abbreviation, chapters: loadedOf(tr, mapRange(base.ref, current.abbreviation, tr.abbreviation)) }]).widened,
        ) ?? current)
      : null;

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
          : { status: "pending", limited: r.failureReason instanceof ReadingLimited },
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
  const curLocale = bookLocale(current.language);
  const title = base ? ownLabel(base.ref, current.language) : "";
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
        return t("compare.moved", { ref: ownLabel(n.ref, tr.language) });
      case "absent":
        return t("compare.absent", { n: n.verses.join(", ") });
      case "psalmTitle":
        return t("compare.psalmTitle");
      case "unmapped":
        return t("compare.unmapped");
    }
  }

  // ---- copy ----
  const copyBlocks = blocks.flatMap(({ tr, slices, view }) =>
    view.kind === "ready" && view.parts.length
      ? [{ abbr: tr.abbreviation, ref: numberingDiffers(slices) && view.ref ? ownLabel(view.ref, tr.language) : undefined, parts: view.parts, own: view.ref }]
      : [],
  );
  const allCount = copyAllCount(copyBlocks);
  const allowAll = canCopyAll(copyBlocks);
  async function copyBlock(tr: Translation, view: Extract<BlockView, { kind: "ready" }>) {
    if (partsVerseCount(view.parts) > MAX_COPY_VERSES) {
      notifyCopyLimit();
      return;
    }
    const label = view.ref ? ownLabel(view.ref, tr.language) : title;
    const { text, html } = versesCopy(view.parts, label, tr.abbreviation);
    if (await writeClipboard(text, html)) toast(t("compare.copied", { ref: label, abbr: tr.abbreviation }));
  }
  async function copyAll() {
    if (!allowAll || !copyBlocks.length) return;
    const { text, html } = formatCopyAll(title, copyBlocks);
    if (await writeClipboard(text, html)) toast(t("compare.copied", { ref: title, abbr: copyBlocks.map((b) => b.abbr).join(" · ") }));
  }

  // ---- jump ----
  // The read route's switch lands there and says so: "Now reading NIV ·
  // Back to WEB" (≥ 10 s), Back = the original translation, chapter, verse
  function jump(tr: Translation, to: Place) {
    jumped.current = true;
    onOpenChange(false);
    switchTranslation(tr.id, { book: to.book, chapter: to.chapter, verse: to.verse ?? 1 }, { long: true });
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

  const header = (
    <header className="flex shrink-0 items-start gap-3 border-b border-border px-4 pt-3 pb-3 sm:px-5">
      <div className="min-w-0 flex-1">
        <p className="eyebrow">{t("compare.title")}</p>
        {isMobile ? (
          <DrawerTitle
            ref={titleRef}
            tabIndex={-1}
            className={cn("font-serif text-title leading-tight font-semibold text-foreground", focusTitle)}
          >
            <span lang={current.language}>{title}</span>
          </DrawerTitle>
        ) : (
          <DialogTitle
            ref={titleRef}
            tabIndex={-1}
            className={cn("font-serif text-title leading-tight font-semibold", focusTitle)}
          >
            <span lang={current.language}>{title}</span>
          </DialogTitle>
        )}
        {base?.partial && <p className="mt-0.5 text-meta text-muted-foreground">{t("compare.wholeVerses")}</p>}
        {ref && widenedBy && (
          <p className="mt-0.5 text-meta text-muted-foreground">
            {t("compare.widened", { ref: shortRef(ref, curLocale), abbr: widenedBy.abbreviation })}
          </p>
        )}
      </div>
      <Button variant="outline" size="sm" className="shrink-0 pointer-coarse:h-11" onClick={() => onOpenChange(false)}>
        {t("compare.close")}
      </Button>
    </header>
  );

  const body = (
    <>
      {!pinned && <div className="pb-5">{picker}</div>}
      {picks.length === 0 && others.length > 0 && (
        <p className="mb-5 rounded-md border border-dashed border-border px-3 py-2 text-control text-muted-foreground">{t("compare.empty")}</p>
      )}
      {blocks.map(({ tr, slices, view }, i) => (
        <CompareBlock
          key={tr.id}
          first={i === 0}
          tr={tr}
          isCurrent={tr.id === current.id}
          slices={slices}
          view={view}
          noteText={(n) => noteText(n, tr)}
          problem={view.kind === "problem" ? problemText(view, tr.abbreviation) : null}
          onRetry={() => retry(tr.id, sliceChapters(slices))}
          onCopy={() => view.kind === "ready" && void copyBlock(tr, view)}
          onJump={(to) => jump(tr, to)}
        />
      ))}
    </>
  );

  const foot = (
    <footer className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-t border-border px-4 py-2.5 sm:px-5 pb-[max(env(safe-area-inset-bottom),0.625rem)]">
      <ScriptureCredit className="min-w-0 flex-1" onFollow={() => onOpenChange(false)} />
      {!allowAll && (
        <p id={`${ids}-cap`} className="basis-full text-meta text-muted-foreground sm:order-first">
          {t("compare.copyCap", { count: allCount })}
        </p>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="pointer-coarse:h-11"
        disabled={!allowAll || copyBlocks.length === 0}
        aria-describedby={!allowAll ? `${ids}-cap` : undefined}
        onClick={() => void copyAll()}
      >
        {t("compare.copyAll")}
      </Button>
      <Button variant="outline" size="sm" className="pointer-coarse:h-11" onClick={() => onOpenChange(false)}>
        {t("compare.close")}
      </Button>
    </footer>
  );

  const content = (
    <>
      {header}
      {pinned && <div className="shrink-0 border-b border-border px-4 py-3 sm:px-5">{picker}</div>}
      {/* Swipes inside never close the drawer: only its header drags */}
      <ScrollArea className="min-h-0 flex-1" data-base-ui-swipe-ignore="">
        <div className="px-4 pt-5 pb-6 sm:px-5">{body}</div>
      </ScrollArea>
      {foot}
      {/* Problems only, always naming the translation */}
      <div aria-live="polite" className="sr-only">
        {problems.join(" ")}
      </div>
      {open && tokens.map((tk) => <FumsView key={tk} token={tk} />)}
    </>
  );

  const final = () => (jumped.current ? false : finalFocus());

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange} showSwipeHandle>
        <DrawerContent className="h-[92dvh] max-h-[92dvh]" initialFocus={titleRef} finalFocus={final}>
          {content}
        </DrawerContent>
      </Drawer>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        initialFocus={titleRef}
        finalFocus={final}
        className="top-[8dvh] flex h-[min(84dvh,56rem)] w-[min(40rem,calc(100vw-2rem))] max-w-none translate-y-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
      >
        {content}
      </DialogContent>
    </Dialog>
  );
}

function CompareBlock({
  first,
  tr,
  isCurrent,
  slices,
  view,
  noteText,
  problem,
  onRetry,
  onCopy,
  onJump,
}: {
  first: boolean;
  tr: Translation;
  isCurrent: boolean;
  slices: MappedSlice[];
  view: BlockView;
  noteText: (n: BlockNote) => string;
  problem: string | null;
  onRetry: () => void;
  onCopy: () => void;
  onJump: (to: Place) => void;
}) {
  const { t } = useTranslation();
  const hid = useId();
  const name = translationTitle(tr);
  const locale = bookLocale(tr.language);
  // Own reference: what it shows, else what the map says it will
  const target = jumpTarget(slices);
  const planned = slices.filter((s) => s.kind !== "unmapped" && s.startVerse > 0);
  const plannedRef: ScriptureRef | null = planned.length
    ? (() => {
        const a = planned[0];
        const b = planned[planned.length - 1];
        const r: ScriptureRef = { book: a.book, chapter: a.chapter, verse: a.startVerse };
        if (b.chapter !== a.chapter) Object.assign(r, { endChapter: b.chapter, endVerse: b.endVerse });
        else if (b.endVerse !== a.startVerse) r.endVerse = b.endVerse;
        return r;
      })()
    : null;
  const own = view.kind === "ready" ? view.ref ?? plannedRef : plannedRef;
  const ownText = own ? ownLabel(own, tr.language) : null;
  const jumpTo: Place | null = view.kind === "ready" && view.ref ? { book: view.ref.book, chapter: view.ref.chapter, verse: view.ref.verse } : target;
  const jumpRef = jumpTo ? ownLabel({ book: jumpTo.book, chapter: jumpTo.chapter, verse: jumpTo.verse }, tr.language) : "";
  const copyright = view.kind === "ready" ? [...new Set(view.parts.map((p) => p.chapter.copyright?.trim()).filter(Boolean))] : [];

  return (
    <section
      aria-labelledby={hid}
      aria-busy={view.kind === "loading" || undefined}
      className={cn("[contain-intrinsic-size:auto_12rem] [content-visibility:auto]", !first && "mt-7 border-t border-foreground/12 pt-7 max-sm:mt-6 max-sm:pt-6")}
    >
      <div className="mb-3 flex flex-wrap items-start gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1 font-sans">
          <h3 id={hid} className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-meta font-semibold tracking-[0.06em]">{tr.abbreviation}</span>
            <span className="text-meta text-muted-foreground">{name}</span>
          </h3>
          {ownText && (
            <p lang={tr.language} className="text-list font-medium">
              {ownText}
            </p>
          )}
          {view.kind === "ready" &&
            view.notes.map((n) => (
              <p key={n.kind} className="text-meta text-muted-foreground">
                {noteText(n)}
              </p>
            ))}
        </div>
        <div className="flex shrink-0 gap-1">
          {!isCurrent && jumpTo && (
            <Button
              variant="ghost"
              size="sm"
              className="pointer-coarse:h-11"
              onClick={() => onJump(jumpTo)}
            >
              {/* Named "Continue in NIV, New International Version, Salme 51,3":
                  the visible words first (WCAG 2.5.3), then where it goes */}
              {t("compare.jump", { abbr: tr.abbreviation })}
              <span className="sr-only">{t("compare.jumpWhere", { name, ref: jumpRef })}</span>
            </Button>
          )}
          {view.kind === "ready" && view.parts.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="pointer-coarse:h-11"
              aria-label={t("compare.copyNamed", { abbr: tr.abbreviation })}
              onClick={onCopy}
            >
              {t("compare.copy")}
            </Button>
          )}
        </div>
      </div>

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
        <PassageText parts={view.parts} language={tr.language} numberSep={locale === "da" ? "," : ":"} />
      )}
      {copyright.length > 0 && (
        <p className="mt-3 font-sans text-meta leading-[1.45] text-muted-foreground">{copyright.join(" · ")}</p>
      )}
    </section>
  );
}

/** Lines sized from the verse count (em, like the text), plus a muted line
 * for the rights row; still under reduced motion. */
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
      <div className="mt-3 h-3 w-40 rounded bg-muted/60" />
    </div>
  );
}
