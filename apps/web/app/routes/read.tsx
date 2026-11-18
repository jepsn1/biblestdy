import type { Translation } from "@biblestdy/shared";
import { bookName } from "@biblestdy/shared";
import type { Chapter } from "@biblestdy/shared";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { data, type ShouldRevalidateFunctionArgs, useNavigate, useRevalidator, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { toast } from "~/lib/toast";
import { bookLocale, useBookName } from "~/lib/book-name";
import i18n from "~/lib/i18n";
import { loadReaderStyle } from "~/lib/reader-style";
import { loadTextSize } from "~/lib/text-size";
import { loadHighlightLabels } from "~/lib/highlight-labels";
import { queryClient } from "~/lib/query";
import { pathOf, requireAuth } from "~/lib/require-auth";
import { loadMarkedTranslationId } from "~/lib/preferences";
import { readingTranslation, rememberDefaultTranslation } from "~/lib/reading-translation";
import { ignoreShortcut, loadSingleKeys } from "~/lib/shortcuts";
import { fetchScripture } from "~/lib/scripture-fetch";
import { describeRouteError } from "~/lib/route-error";
import { zoomLockHandle } from "~/lib/viewport";
import { adjacentChapter, schemeOf } from "../reader/chapter-nav";
import { translationTitle } from "../reader/translation-chooser";
import type { Landing, Place } from "../reader/switch-place";
import { PaginatedChapter, useChapterStrip, useScrollMode } from "../reader/paginated-chapter";
import { ReaderError } from "../reader/reader-error";
import { chapterQuery, loadChapter, prefetchNeighbours, readingPausedFor, retryWhenLimited } from "../reader/chapter-cache";
import { ChapterSkeleton } from "../reader/chapter-skeleton";
import { ReadingLimited, readingLimitRouteError } from "../reader/reading-limit";
import { ReaderNav } from "../reader/reader-nav";
import { referenceLabel } from "../notes/note-list";
import { OPEN_COLOR_NAMES, OPEN_COMPARE, OPEN_SHORTCUTS, type CompareAnchor, type CompareRequest } from "../reader/dialog-events";
import { compareDialog, type CompareKit } from "../reader/compare-loader";
import { passageLines } from "../reader/chapter-layout";
import { groupTranslations } from "../reader/translation-chooser";
import { formatWait } from "../reader/reading-limit";
import { referenceLabel as uiReferenceLabel } from "~/lib/reference-label";
import { useFumsView } from "~/lib/fums";
import { useTextSize } from "~/lib/text-size";
import { showVerses } from "~/lib/print-limit";
import { Drawer, DrawerContent, DrawerTitle } from "~/components/lazy-drawer";
import { compareTargetOr } from "../reader/compare-target";
import { SkipToText } from "../reader/skip-link";
import { LazyCommandPalette } from "../palette/lazy-palette";
import { OPEN_PALETTE } from "../palette/open-palette";
import { pushRecent } from "~/lib/recent-passages";
import { lazyModule, useLazyModule, whenIdle } from "~/lib/lazy-module";

/** Shortcuts, colour names, the first-run style choice: none is first paint. */
const dialogs = lazyModule(() => import("../reader/reader-dialogs"));
/** The versification map (#174): only fetched when the translation switches. */
const switchPlace = () => import("../reader/switch-place");

interface PendingSwitch {
  to: string;
  from: Translation;
  /** Where the reader was, in `from`'s numbering. */
  source: Place;
  landing: Landing;
  /** Checks the landing against the loaded chapter (a verse it leaves out). */
  check: ((landing: Landing, chapter: Chapter) => Landing) | null;
}
import { chapterHref } from "../reader/chapter-nav";
import type { Route } from "./+types/read";

/** Handed to the Compare dialog (see CompareKit). */
const compareKit: CompareKit = {
  chapterQuery,
  retryWhenLimited,
  passageLines,
  groupTranslations,
  translationTitle,
  formatWait,
  referenceLabel: uiReferenceLabel,
  useFumsView,
  useTextSize,
  showVerses,
  Drawer,
  DrawerContent,
  DrawerTitle,
};

/** How long a chapter must stay open before its neighbours are fetched. */
const PREFETCH_DELAY_MS = 300;

let translationsCache: Translation[] | undefined;

async function loadTranslations(next: string): Promise<Translation[]> {
  if (translationsCache) return translationsCache;
  const res = await fetchScripture("/api/translations", next);
  if (!res.ok) throw data(i18n.t("error.translationsLoad"), { status: 502 });
  const translations = (await res.json()) as Translation[];
  if (translations.length === 0) throw data(i18n.t("error.noTranslations"), { status: 502 });
  translationsCache = translations;
  return translations;
}

// App route: zoom locked (#61) — the in-app Text size setting enlarges text
export const handle = zoomLockHandle;

export function meta({ params, error }: Route.MetaArgs) {
  if (error) {
    const { kind } = describeRouteError(error, typeof navigator === "undefined" || navigator.onLine);
    const key = { notFound: "error.chapterNotFound", offline: "error.offlineTitle", limit: "readingLimit.title", unexpected: "error.title" }[kind];
    return [{ title: `${i18n.t(key)} — biblestdy` }];
  }
  const locale = bookLocale(i18n.language);
  const title = referenceLabel(
    { book: params.book.toUpperCase(), chapter: Number(params.chapter) },
    (id) => bookName(id, locale),
    locale,
  );
  return [{ title: `${title} — biblestdy` }];
}

/** Page turns rewrite `?p=` (and ?note/?mark come and go) — none of that
 * needs the chapter refetched. A real chapter change or an explicit
 * revalidate (translation switch) still does. */
export function shouldRevalidate({
  currentUrl,
  nextUrl,
  formMethod,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  if (!formMethod && currentUrl.pathname === nextUrl.pathname && currentUrl.search !== nextUrl.search) {
    return false;
  }
  return defaultShouldRevalidate;
}

export async function clientLoader({ params, request }: Route.ClientLoaderArgs) {
  // Signed out (or the session expired): sign in, then back to this page
  const next = pathOf(request.url);
  const session = await requireAuth({ cached: true, next });
  // Account reader style (#45) applies before render; null = never chosen
  // Text size (#61) too — same single preferences fetch
  // …and the reader's own highlight colour names, and the single-key switch (#145)
  const [translations, readerStyle] = await Promise.all([
    loadTranslations(next),
    loadReaderStyle(session.user.id),
    loadTextSize(session.user.id),
    loadHighlightLabels(session.user.id),
    loadSingleKeys(session.user.id),
  ]);
  const translation = await readingTranslation(translations, i18n.language, loadMarkedTranslationId);
  // From memory when already read or prefetched (chapter-cache.ts). Turning
  // pages faster than the reading quota allows (#29) is no dead end: a short
  // wait shows the sheet as a skeleton and loads by itself (Read below).
  const ref = { book: params.book, chapter: Number(params.chapter) };
  let chapter: Chapter | null = queryClient.getQueryData(chapterQuery(translation.id, ref).queryKey) ?? null;
  try {
    if (!chapter && readingPausedFor() === 0) chapter = await loadChapter(translation.id, ref, next);
  } catch (err) {
    if (!(err instanceof ReadingLimited)) throw err;
    if (!err.shortWait) throw readingLimitRouteError(err);
  }
  if (chapter) noteVisit(chapter);
  return {
    chapter,
    translation,
    translations,
    needsStyleChoice: readerStyle === null,
    userId: session.user.id,
  };
}

/** Errors stay inside the reader's shell (the nav and its address), with a way on. */
export function ErrorBoundary({ error, params }: Route.ErrorBoundaryProps) {
  return <ReaderError error={error} params={params} />;
}

/** Only a chapter that actually loaded may become the launch page; the
 * reader adds the page (?p) once it knows it (#52). */
function noteVisit(chapter: Chapter) {
  // Kept only once it actually served a chapter (a quota/outage error doesn't stick)
  rememberDefaultTranslation(chapter.translationId);
  const here = `${chapter.book}/${chapter.chapter}`;
  const stored = localStorage.getItem("lastRead");
  if (stored !== here && !stored?.startsWith(`${here}?`)) localStorage.setItem("lastRead", here);
  pushRecent({ book: chapter.book, chapter: chapter.chapter });
}

type ReadData = Route.ComponentProps["loaderData"];

/**
 * The chapter, or — while it waits out the reading quota — a skeleton sheet
 * that says so politely and loads it once the wait is over (retried after
 * Retry-After; a long wait becomes the route's limit message).
 */
export default function Read({ loaderData, params }: Route.ComponentProps) {
  const ref = { book: params.book, chapter: Number(params.chapter) };
  const waiting = !loaderData.chapter;
  const q = useQuery({
    ...chapterQuery(loaderData.translation.id, ref),
    ...retryWhenLimited,
    enabled: waiting,
  });
  const chapter = loaderData.chapter ?? q.data ?? null;
  useEffect(() => {
    if (waiting && q.data) noteVisit(q.data);
  }, [waiting, q.data]);
  if (chapter) return <Reader loaderData={{ ...loaderData, chapter }} />;
  if (q.error) throw q.error instanceof ReadingLimited ? readingLimitRouteError(q.error) : q.error;
  return <ChapterPending loaderData={loaderData} book={ref.book} chapter={ref.chapter} />;
}

/** Only ever shown while waiting out the reading quota. */
function ChapterPending({ loaderData, book, chapter }: { loaderData: ReadData; book: string; chapter: number }) {
  const noop = () => {};
  return (
    <div className="flex h-dvh overflow-hidden">
      <main className="relative flex h-full w-full min-w-0 flex-1 flex-col overflow-hidden bg-background">
        <ReaderNav
          book={book}
          chapter={chapter}
          translations={loaderData.translations}
          translationId={loaderData.translation.id}
          onSwitchTranslation={noop}
          connectionsOpen={false}
          onToggleConnections={noop}
          annotationBoxesOpen={false}
          onToggleAnnotationBoxes={noop}
        />
        <ChapterSkeleton limited />
      </main>
    </div>
  );
}

function Reader({ loaderData }: { loaderData: ReadData & { chapter: Chapter } }) {
  const { chapter, translation, translations, needsStyleChoice, userId } = loaderData;
  const [styleChosen, setStyleChosen] = useState(false);
  const revalidator = useRevalidator();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const nameOf = useBookName();
  // The verse the reader is at: a switch lands on it in the new version
  // (page numbers differ between translations)
  const placeRef = useRef<number | null>(null);
  const [, setSearchParams] = useSearchParams();
  const switching = useRef<PendingSwitch | null>(null);
  /** Switches the reading translation and lands on the same text there:
   * mapped across verse numberings (#174: WEB Mal 4:1 → BPH Mal 3,19), never
   * kept by number. `back` = a place already in that translation's numbering
   * (the toast's way back restores where you were). */
  async function switchTranslation(id: string, back?: Place) {
    const to = translations.find((tr) => tr.id === id);
    if (!to || to.id === translation.id) return;
    const source = { book: chapter.book, chapter: chapter.chapter, verse: placeRef.current ?? 1 };
    let landing: Landing = { ...(back ?? source), note: null };
    let check: ((l: Landing, c: Chapter) => Landing) | null = null;
    if (!back) {
      try {
        const m = await switchPlace();
        landing = m.switchLanding(source, translation.abbreviation, to.abbreviation);
        check = m.checkLanding;
      } catch {
        toast.error(t("translations.switchFailed", { abbr: to.abbreviation }));
        return;
      }
    }
    localStorage.setItem("translationId", id);
    switching.current = { to: to.id, from: translation, source, landing, check };
    if (landing.book === chapter.book && landing.chapter === chapter.chapter) void revalidator.revalidate();
    else void navigate(chapterHref(landing), { replace: true }); // the loader reads the new version
  }
  const switchRef = useRef(switchTranslation);
  switchRef.current = switchTranslation;
  // …then lands on the verse there (?v= picks its page) and says where
  useEffect(() => {
    const p = switching.current;
    if (!p || p.to !== translation.id) return;
    switching.current = null;
    const landing = p.check ? p.check(p.landing, chapter) : p.landing;
    setSearchParams(
      (params) => {
        params.delete("p");
        params.set("v", String(landing.verse));
        return params;
      },
      { replace: true },
    );
    const locale = bookLocale(i18n.language);
    const label = (place: Place) => referenceLabel(place, nameOf, locale);
    const prev = p.from.abbreviation;
    const note =
      landing.note === "renumbered"
        ? t("translations.renumbered", { from: label(p.source), prev, to: label(landing) })
        : landing.note === "title"
          ? t("translations.psalmTitle", { abbr: translation.abbreviation })
          : landing.note === "nearest"
            ? t("translations.nearest", {
                abbr: translation.abbreviation,
                ref: label(p.landing.note === "nearest" ? p.source : landing),
              })
            : undefined;
    // A sonner toast is a polite live region: the note is read out too
    toast(t("translations.switched", { name: translationTitle(translation), prev }), {
      description: note,
      duration: note ? 10_000 : undefined,
      action: { label: t("translations.back", { abbr: prev }), onClick: () => void switchRef.current(p.from.id, p.source) },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [translation.id, chapter, setSearchParams]);
  const heading = `${nameOf(chapter.book)} ${chapter.chapter}`; // UI-language name (#53)
  // Prev/next continue across books (#52): John 21 → Acts 1
  const scheme = schemeOf(translation.abbreviation); // BPH: Joel 4, Malachi 3
  const prevChapter = adjacentChapter(chapter, -1, scheme);
  const nextChapter = adjacentChapter(chapter, 1, scheme);
  // Read ahead (both ways) once the reader has settled on this chapter, so
  // the next turn renders from memory. A short wait first: skimming through
  // chapters with [ / ] fetches nothing extra.
  useEffect(() => {
    const prev = adjacentChapter(chapter, -1, scheme);
    const next = adjacentChapter(chapter, 1, scheme);
    let idle = 0;
    const timer = window.setTimeout(() => {
      const run = () => prefetchNeighbours(translation.id, [next, prev]);
      if ("requestIdleCallback" in window) idle = window.requestIdleCallback(run, { timeout: 2000 });
      else run();
    }, PREFETCH_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
      if (idle) window.cancelIdleCallback(idle);
    };
  }, [chapter, translation.id, scheme]);
  // ONE side slot, content switches: 'connections' | a note id | null.
  // Connections open/closed is the sticky ambient preference; a note borrows
  // the slot and closing it falls back to that preference.
  const [sideView, setSideView] = useState<string | null>(() =>
    typeof localStorage !== "undefined" && localStorage.getItem("connectionsOpen") === "1"
      ? "connections"
      : null,
  );
  // Mobile annotation layer (#15): default OFF — reading shows only
  // highlights/scribbles; the nav toggle reveals the boxes. Not persisted.
  const [annotationBoxesOpen, setAnnotationBoxesOpen] = useState(false);
  function toggleConnections() {
    setSideView((view) => {
      // From a note, Waypoints switches BACK to connections (never closes)
      const next = view === "connections" ? null : "connections";
      localStorage.setItem("connectionsOpen", next ? "1" : "0");
      return next;
    });
  }

  // Reader-wide keys (#65): `?` lists every shortcut; ⌘. / Ctrl+. toggles
  // Notes & topics (from anywhere, the note editor included).
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [colorNamesOpen, setColorNamesOpen] = useState(false);
  const colorNamesReturn = useRef<HTMLElement | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Compare translations (#167): its own chunk, asked open by OPEN_COMPARE
  // (menus, `p`, the palette, the translation sheet)
  const firstOnPage = (): CompareAnchor | null => {
    const v = chapter.verses.find((x) => x.verse === placeRef.current) ?? chapter.verses[0];
    if (!v) return null;
    return { translationId: translation.id, book: chapter.book, chapter: chapter.chapter, startVerse: v.verse, endVerse: v.verse };
  };
  const firstOnPageRef = useRef(firstOnPage);
  firstOnPageRef.current = firstOnPage;
  const [compare, setCompare] = useState<CompareRequest | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  useEffect(() => {
    const onCompare = (e: Event) => {
      const req = (e as CustomEvent<CompareRequest>).detail ?? {};
      const anchor = req.anchor ?? (req.range ? undefined : (compareTargetOr(firstOnPageRef.current()) ?? undefined));
      if (!anchor && !req.range) return;
      setCompare({ ...req, anchor });
      setCompareOpen(true);
    };
    window.addEventListener(OPEN_COMPARE, onCompare);
    return () => window.removeEventListener(OPEN_COMPARE, onCompare);
  }, []);
  const { value: cmp, error: compareError, retry: compareRetry } = useLazyModule(compareDialog, compareOpen);
  // The chunk didn't come: say so, hand focus back
  useEffect(() => {
    if (!compareError || !compareOpen) return;
    toast.error(i18n.t("compare.loadFailed"));
    setCompareOpen(false);
    const back = compare?.returnTo;
    if (typeof back === "function") back();
    else back?.focus();
    compareRetry();
  }, [compareError, compareOpen, compare, compareRetry]);
  const compareFocus = () => {
    const back = compare?.returnTo;
    if (typeof back === "function") {
      back();
      return false as const;
    }
    if (back?.isConnected) return back;
    return document.getElementById("chapter-text") ?? (false as const);
  };

  useEffect(() => {
    const open = () => setPaletteOpen(true);
    window.addEventListener(OPEN_PALETTE, open);
    return () => window.removeEventListener(OPEN_PALETTE, open);
  }, []);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key === ".") {
        e.preventDefault();
        toggleConnections();
        return;
      }
      if (e.key === "?" && !ignoreShortcut(e)) {
        e.preventDefault();
        setShortcutsOpen(true);
      }
    }
    const open = () => setShortcutsOpen(true);
    const openNames = (e: Event) => {
      colorNamesReturn.current = (e as CustomEvent<HTMLElement | null>).detail;
      setColorNamesOpen(true);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_SHORTCUTS, open);
    window.addEventListener(OPEN_COLOR_NAMES, openNames);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_SHORTCUTS, open);
      window.removeEventListener(OPEN_COLOR_NAMES, openNames);
    };
  }, []);

  // The dialogs' chunk: once idle, or as soon as one is wanted
  const [dialogsIdle, setDialogsIdle] = useState(false);
  useEffect(() => whenIdle(() => setDialogsIdle(true)), []);
  const choosingStyle = needsStyleChoice && !styleChosen;
  const { value: d } = useLazyModule(dialogs, dialogsIdle || shortcutsOpen || colorNamesOpen || choosingStyle);

  // The paged sheet heads its text with the chapter strip
  const chapterStrip = useChapterStrip();
  const scrollMode = useScrollMode();
  // The last chapter the spread shows when chapters run on (#146), per chapter
  const [spread, setSpread] = useState<{ key: string; end: number | null }>({ key: "", end: null });
  const chapterKey = `${chapter.book}.${chapter.chapter}`;
  const onSpreadEnd = useCallback((end: number | null) => setSpread({ key: chapterKey, end }), [chapterKey]);
  const spreadEnd = spread.key === chapterKey ? spread.end : null;

  return (
    <div className="flex h-dvh overflow-hidden">
      <SkipToText />
      <main className="relative flex h-full w-full min-w-0 flex-1 flex-col overflow-hidden bg-background">
        <ReaderNav
          book={chapter.book}
          chapter={chapter.chapter}
          translations={translations}
          translationId={translation.id}
          onSwitchTranslation={switchTranslation}
          connectionsOpen={sideView === "connections"}
          onToggleConnections={toggleConnections}
          annotationBoxesOpen={annotationBoxesOpen}
          onToggleAnnotationBoxes={() => setAnnotationBoxesOpen((v) => !v)}
          chapterInStrip={chapterStrip}
          chapterTo={spreadEnd}
          scrollMode={scrollMode}
        />
        <PaginatedChapter
          chapter={chapter}
          translation={translation}
          translations={translations}
          heading={heading}
          prevChapter={prevChapter}
          nextChapter={nextChapter}
          sideView={sideView}
          onSideViewChange={setSideView}
          annotationBoxesOpen={annotationBoxesOpen}
          placeRef={placeRef}
          onSpreadEnd={onSpreadEnd}
        />
      </main>
      {d && (
        <>
          <d.ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
          <d.ColorNamesDialog open={colorNamesOpen} onOpenChange={setColorNamesOpen} returnTo={colorNamesReturn} />
        </>
      )}
      <LazyCommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        reader={{
          book: chapter.book,
          chapter: chapter.chapter,
          translations,
          translationId: translation.id,
          switchTranslation,
          toggleConnections,
          connectionsOpen: sideView === "connections",
          toggleMarginNotes: () => setAnnotationBoxesOpen((v) => !v),
          marginNotesOpen: annotationBoxesOpen,
          prevHref: prevChapter ? chapterHref(prevChapter) : null,
          nextHref: nextChapter ? chapterHref(nextChapter) : null,
          compareAt: paletteOpen ? compareTargetOr(firstOnPage()) : null,
        }}
      />
      {cmp && compare && (
        <cmp.CompareDialog
          open={compareOpen}
          onOpenChange={setCompareOpen}
          anchor={compare.anchor}
          range={compare.range}
          finalFocus={compareFocus}
          translations={translations}
          current={translation}
          kit={compareKit}
        />
      )}
      {d && choosingStyle && <d.StyleChooser verse={chapter.verses[0]} onDone={() => setStyleChosen(true)} />}
    </div>
  );
}
