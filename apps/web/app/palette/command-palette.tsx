import type { Tag, Translation } from "@biblestdy/shared";
import { TEXT_SIZES, translationInfo } from "@biblestdy/shared";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  BookText,
  Check,
  ChevronRight,
  CircleX,
  CornerDownLeft,
  Hash,
  Highlighter,
  History,
  Sprout,
  NotebookText,
  PenLine,
  Search,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { toast } from "~/lib/toast";
import { modKey } from "~/components/hint";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "~/components/ui/dialog";
import { ScrollArea } from "~/components/ui/scroll-area";
import { useIsMobile } from "~/hooks/use-mobile";
import { setHighlightFilter, useHighlightFilter } from "~/lib/highlight-filter";
import { useColorName } from "~/lib/highlight-labels";
import { bookLocale, useBookName } from "~/lib/book-name";
import i18n, { setUiLanguage } from "~/lib/i18n";
import { api } from "~/lib/query";
import { clearRecent, readRecent, restoreRecent } from "~/lib/recent-passages";
import { saveReaderStyle, useReaderStyle } from "~/lib/reader-style";
import { setThemePref, THEME_PREFS, useThemePref } from "~/lib/theme";
import { saveTextSize, useTextSize } from "~/lib/text-size";
import { keyboardUp } from "~/lib/safe-area";
import { cn, focusTitle } from "~/lib/utils";
import { INSERT_VERSE, openCompare, OPEN_SHORTCUTS, useNoteEditorOpen, type CompareAnchor } from "../reader/dialog-events";
import { referenceLabel } from "~/lib/reference-label";
// Its Compare rows' words (shared with the Compare chunk, #167)
import "../locales/compare";
import { showToursAgain } from "../notes/tour-replay";
import { HIGHLIGHT_SWATCH } from "../reader/highlight-colors";
import { OPEN_TRANSLATIONS, translationTitle } from "../reader/translation-chooser";
import { openPlace } from "../reader/place-chooser";
import { useAllAnnotationsQuery } from "../reader/use-annotations";
import { useAllHighlightsQuery } from "../reader/use-highlights";
import { ScriptureCredit } from "../reader/scripture-credit";
import { useAllNotesQuery } from "../reader/use-notes";
import { paletteOpener, takeTypeahead } from "./open-palette";
import { buildResults, matchRanges, type GroupId, type PaletteAction, type PaletteItem } from "./palette-results";

/** What the reader lets the palette do (state lives in the read route). */
export type ReaderActions = {
  book: string;
  chapter: number;
  translations: Translation[];
  translationId: string;
  switchTranslation: (id: string) => void;
  toggleConnections: () => void;
  connectionsOpen: boolean;
  toggleMarginNotes: () => void;
  marginNotesOpen: boolean;
  prevHref: string | null;
  nextHref: string | null;
  /** Compare translations acts on this (selection → focused verse → first
   * on the page, #167); null = not offered. */
  compareAt: CompareAnchor | null;
};

/** Both UI languages' wording of a key: Danish words find English labels too. */
const both = (key: string, opts?: Record<string, unknown>) => [
  i18n.t(key, { ...opts, lng: "en" }),
  i18n.t(key, { ...opts, lng: "da" }),
];

function useActions(r: ReaderActions) {
  const { t } = useTranslation();
  const theme = useThemePref();
  const style = useReaderStyle();
  const size = useTextSize();
  const navigate = useNavigate();
  const lang = i18n.language.startsWith("da") ? "da" : "en";
  const sizeIdx = TEXT_SIZES.indexOf(size);

  const isMobile = useIsMobile();
  const noteOpen = useNoteEditorOpen();
  const nameOf = useBookName();
  const at = r.compareAt;
  const actions: (PaletteAction & { run: () => void; keepOpen?: boolean; opensDialog?: boolean })[] = [
    {
      id: "translations",
      label: t("palette.chooseTranslation"),
      keywords: [...both("palette.chooseTranslation"), ...both("nav.translation")],
      shortcut: "T",
      common: true,
      opensDialog: true,
      run: () => window.dispatchEvent(new Event(OPEN_TRANSLATIONS)),
    },
    ...(at
      ? [
          {
            id: "compare",
            label: t("palette.compareAction", {
              ref: referenceLabel(
                { book: at.book, chapter: at.chapter, verse: at.startVerse, ...(at.endVerse > at.startVerse ? { endVerse: at.endVerse } : {}) },
                nameOf,
                lang,
              ),
            }),
            keywords: [...both("menu.compare"), ...both("menu.compareHint"), ...both("nav.translation")],
            opensDialog: true,
            run: () => openCompare({ anchor: at, returnTo: paletteOpener() }),
          },
        ]
      : []),
    ...r.translations.map((tr) => ({
      id: `read-${tr.abbreviation}`,
      label: t("palette.readIn", { abbr: tr.abbreviation, name: translationTitle(tr) }),
      keywords: [tr.abbreviation, translationTitle(tr), translationInfo(tr.abbreviation)?.shortName ?? "", ...both("nav.translation")],
      checked: tr.id === r.translationId,
      run: () => r.switchTranslation(tr.id),
    })),
    {
      id: "connections",
      label: t(r.connectionsOpen ? "palette.closeConnections" : "palette.openConnections"),
      keywords: [...both("nav.connectionsToggle"), ...both("palette.notesWord")],
      shortcut: `${modKey()}.`,
      common: true,
      run: r.toggleConnections,
    },
    {
      id: "all-notes",
      label: t("palette.allNotes"),
      keywords: [...both("palette.allNotes"), ...both("palette.notesWord")],
      common: true,
      opensDialog: true, // leaves the reader: focus goes with the page
      run: () => navigate("/notes"),
    },
    {
      id: "place",
      label: t("place.choose"),
      keywords: [...both("place.choose"), ...both("place.books")],
      shortcut: `${modKey()}B`,
      opensDialog: true,
      run: () => openPlace(),
    },
    {
      id: "margin",
      label: t(r.marginNotesOpen ? "palette.hideMargin" : "palette.showMargin"),
      keywords: [...both("palette.showMargin"), ...both("palette.hideMargin")],
      run: r.toggleMarginNotes,
    },
    ...(r.prevHref ? [{ id: "prev", label: t("nav.prevChapter"), keywords: both("nav.prevChapter"), shortcut: "[", run: () => {} }] : []),
    ...(r.nextHref ? [{ id: "next", label: t("nav.nextChapter"), keywords: both("nav.nextChapter"), shortcut: "]", run: () => {} }] : []),
    ...THEME_PREFS.map((p) => ({
      id: `theme-${p}`,
      label: theme === p ? t("palette.theme", { value: t(`theme.${p}`) }) : t("palette.switchTheme", { value: t(`theme.${p}`).toLowerCase() }),
      keywords: [...both("settings.theme"), ...both(`theme.${p}`)],
      checked: theme === p,
      common: p !== theme && p !== "system",
      run: () => {
        const prev = theme;
        setThemePref(p);
        toast(t("palette.themeChanged", { value: t(`theme.${p}`) }), {
          duration: 8000,
          action: { label: t("toast.undo"), onClick: () => setThemePref(prev) },
        });
      },
    })),
    ...(["paper", "clean"] as const).map((s) => ({
      id: `style-${s}`,
      label: t("palette.style", { value: t(`readerStyle.${s}`) }),
      keywords: [...both("settings.style"), ...both(`readerStyle.${s}`)],
      checked: style === s,
      run: () => {
        const prev = style;
        void saveReaderStyle(s);
        toast(t("palette.styleChanged", { value: t(`readerStyle.${s}`) }), {
          duration: 8000,
          action: { label: t("toast.undo"), onClick: () => void saveReaderStyle(prev) },
        });
      },
    })),
    {
      id: "size-up",
      label: t("palette.larger", { size: `${size}%` }),
      keywords: [...both("settings.textSize"), ...both("palette.larger", { size: "" })],
      keepOpen: true,
      run: () => sizeIdx < TEXT_SIZES.length - 1 && void saveTextSize(TEXT_SIZES[sizeIdx + 1]),
    },
    {
      id: "size-down",
      label: t("palette.smaller", { size: `${size}%` }),
      keywords: [...both("settings.textSize"), ...both("palette.smaller", { size: "" })],
      keepOpen: true,
      run: () => sizeIdx > 0 && void saveTextSize(TEXT_SIZES[sizeIdx - 1]),
    },
    ...(["en", "da"] as const).map((l) => ({
      id: `lang-${l}`,
      label: l === "en" ? "Language: English" : "Sprog: Dansk",
      keywords: [...both("settings.language"), l === "en" ? "English engelsk" : "Dansk Danish"],
      checked: lang === l,
      run: () => setUiLanguage(l),
    })),
    ...(isMobile ? [] : [{
      id: "shortcuts",
      label: t("nav.shortcuts"),
      keywords: [...both("nav.shortcuts"), "keyboard tastatur"],
      shortcut: "?",
      common: true,
      opensDialog: true,
      run: () => window.dispatchEvent(new Event(OPEN_SHORTCUTS)),
    }]),
    // While a note is open (#160): its "+ Verse" picker, the caret kept
    ...(noteOpen ? [{
      id: "insert-verse",
      label: t("palette.insertVerse"),
      keywords: [...both("palette.insertVerse"), ...both("note.verseButton"), "skriftsted reference passage"],
      shortcut: `${modKey()}Shift+E`,
      common: true,
      opensDialog: true,
      run: () => window.dispatchEvent(new Event(INSERT_VERSE)),
    }] : []),
    // The notes tours again (#162) — in an open note it starts at once
    {
      id: "replay-tour",
      label: t("tour.replay"),
      keywords: [...both("tour.replay"), ...both("tour.replayKeywords")],
      run: showToursAgain,
    },
  ];
  return actions;
}

const GROUP_LABEL: Record<GroupId, string> = {
  recent: "palette.groupRecent",
  start: "place.start",
  passage: "palette.groupPassage",
  books: "palette.groupBooks",
  actions: "palette.groupActions",
  notes: "palette.groupNotes",
  annotations: "palette.groupAnnotations",
  highlights: "palette.groupHighlights",
  colors: "palette.groupColors",
  topics: "palette.groupTopics",
  hint: "",
};

/** Each kind of row has its icon: on the group heading, and on every row
 * (a highlight's own colour dot stands in), so a mixed list reads at a glance. */
const GROUP_ICON: Record<GroupId, LucideIcon | null> = {
  recent: History,
  start: Sprout,
  passage: BookOpen,
  books: BookText,
  actions: SlidersHorizontal,
  notes: NotebookText,
  annotations: PenLine,
  highlights: Highlighter,
  colors: Highlighter,
  topics: Hash,
  hint: null,
};

/** Bold where the typed words hit (visual only: a plain <b>, so screen
 * readers read the row's name in one piece, without "highlighted" noise). */
function Marked({ text, match }: { text: string; match?: string }) {
  const ranges = match ? matchRanges(text, match) : [];
  if (!ranges.length) return text;
  const out: React.ReactNode[] = [];
  let at = 0;
  for (const [a, b] of ranges) {
    if (a > at) out.push(text.slice(at, a));
    out.push(
      <b key={a} className="font-semibold text-foreground">
        {text.slice(a, b)}
      </b>,
    );
    at = b;
  }
  if (at < text.length) out.push(text.slice(at));
  return out;
}

/** Search tips (folded away under the list): what you can type. */
const TIPS = ["passage", "words", "color", "prefix"] as const;

/**
 * Command palette + omni search (⌘K / Ctrl+K anywhere, `/` when not typing):
 * empty, a few commands and recently read; typed, one search over passages,
 * books, your highlight colours, notes, margin notes and highlights (by
 * passage or words, marks also by their marked words), topics and commands,
 * the typed words in bold. Keyboard-first (↑/↓, Enter, ⌘/Ctrl+Enter = new
 * tab, Tab completes a book, Esc closes); every row is clickable. How to
 * search sits folded under the list ("Search tips"), not in a footer. Full
 * screen on phones with a worded way back. Never fetches scripture.
 */
export function CommandPalette({
  open,
  onOpenChange,
  reader,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reader: ReaderActions;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const nameOf = useBookName();
  const locale = bookLocale(i18n.language);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  /** After closing: back where focus was (Esc), the text (navigated), or
   * nothing (another dialog took over). */
  const nextFocus = useRef<"return" | "text" | "none">("return");
  const afterClose = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (open) nextFocus.current = "return";
  }, [open]);

  // Phone (#243, spec 6): the screen is opaque over the whole layout
  // viewport — whatever iOS shows behind its keyboard, or after a pan, is
  // the screen's own colour — and its column follows the visible area. One
  // rAF per change, a transform (no re-layout per frame), only when moved.
  const [column, setColumn] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!open || !isMobile || !vv || !column) return;
    let frame = 0;
    let top = NaN;
    let height = NaN;
    const write = () => {
      frame = 0;
      if (vv.offsetTop !== top) column.style.setProperty("--vv-top", `${(top = vv.offsetTop)}px`);
      if (vv.height !== height) {
        column.style.setProperty("--vv-h", `${(height = vv.height)}px`);
        // Keyboard up (#251): it covers the home indicator, so the list's
        // end needs no inset of its own — never both
        if (keyboardUp(vv.height, document.documentElement.clientHeight)) column.style.setProperty("--vv-safe-bottom", "0px");
        else column.style.removeProperty("--vv-safe-bottom");
      }
    };
    const update = () => {
      if (!frame) frame = requestAnimationFrame(write);
    };
    write();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      cancelAnimationFrame(frame);
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [open, isMobile, column]);

  // Phone (spec 8): the open screen is a history entry, so Android's back
  // and the iOS edge swipe close it (popstate) and nothing else. Every way
  // out unwinds it (closeVia); a jump replaces it. Idempotent per open
  // (StrictMode runs effects twice).
  const entry = useRef<number | null>(null);
  const entryOnTop = () => entry.current !== null && window.history.state?.palette === entry.current;
  const closeNow = useRef(() => onOpenChange(false));
  closeNow.current = () => onOpenChange(false);
  useEffect(() => {
    if (!open || !isMobile) return;
    if (!entryOnTop()) {
      entry.current = Date.now();
      window.history.pushState({ ...window.history.state, palette: entry.current }, "");
    }
    const onPop = () => {
      if (entryOnTop()) return;
      entry.current = null;
      closeNow.current();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [open, isMobile]);
  useEffect(() => {
    if (open) return;
    if (entryOnTop()) window.history.back(); // closed some other way: unwind it
    entry.current = null;
  }, [open]);
  /** Every close that isn't a jump: our entry on top → back (popstate
   * closes); missing (deep link, entry lost) → close at once, so Cancel
   * never leaves the site. */
  function closeVia() {
    if (entryOnTop()) window.history.back();
    else onOpenChange(false);
  }
  /** A jump: closes, and the new page takes our entry's place. */
  function leave(href: string) {
    const replace = entryOnTop();
    entry.current = null;
    onOpenChange(false);
    navigate(href, replace ? { replace } : undefined);
  }

  // Phone pan guard (spec 6): iOS pans the visual viewport while the
  // keyboard is up; only the list may move, and only while it can scroll
  // that way. A drag on the list (>10px) drops the keyboard.
  const viewportRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open || !isMobile) return;
    let startY = 0;
    let lastY = 0;
    const onStart = (e: TouchEvent) => {
      startY = lastY = e.touches[0]?.clientY ?? 0;
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return; // pinch zoom stays free
      const y = e.touches[0].clientY;
      const dy = y - lastY;
      lastY = y;
      const target = e.target as Element | null;
      if (target?.closest?.("input")) return;
      const vp = viewportRef.current;
      if (vp && target && vp.contains(target)) {
        if (Math.abs(y - startY) > 10 && document.activeElement === inputRef.current) inputRef.current?.blur();
        const canUp = vp.scrollTop > 0;
        const canDown = vp.scrollTop + vp.clientHeight < vp.scrollHeight - 1;
        if ((dy > 0 && canUp) || (dy < 0 && canDown) || dy === 0) return;
      }
      if (e.cancelable) e.preventDefault();
    };
    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: false });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
    };
  }, [open, isMobile]);
  // Phone: the full placeholder only where it fits the field (large text,
  // 320px): else just "Søg"
  const [shortHint, setShortHint] = useState(false);
  useEffect(() => {
    const el = inputRef.current;
    if (!open || !isMobile || !el || typeof ResizeObserver === "undefined") return;
    const ctx = document.createElement("canvas").getContext("2d");
    const check = () => {
      const cs = getComputedStyle(el);
      if (!ctx) return;
      ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const room = el.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      setShortHint(ctx.measureText(t("palette.placeholder")).width > room);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, isMobile, column, t]);
  // The hairline under the bar: only once the list has scrolled
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const vp = viewportRef.current;
    if (!open || !isMobile || !vp) return setScrolled(false);
    const onScroll = () => setScrolled(vp.scrollTop > 0);
    vp.addEventListener("scroll", onScroll, { passive: true });
    return () => vp.removeEventListener("scroll", onScroll);
  }, [open, isMobile, column]);

  const { notes } = useAllNotesQuery(open);
  const annotations = useAllAnnotationsQuery(open);
  const highlights = useAllHighlightsQuery(open);
  const { data: tags = [] } = useQuery({
    queryKey: ["tags", "all"],
    queryFn: () => api<Tag[]>("/api/tags").catch(() => []),
    enabled: open,
  });
  const actions = useActions(reader);
  const { name: colorNameOf, title: colorTitle, custom: colorLabel } = useColorName();
  const filter = useHighlightFilter();
  const [tipsOpen, setTipsOpen] = useState(false);
  // "Ryd" (spec 4) re-reads the list
  const [recentRev, setRecentRev] = useState(0);

  const items = useMemo(() => {
    if (!open) return [];
    return buildResults(query, {
      locale,
      bookName: nameOf,
      notes,
      annotations,
      highlights,
      tags,
      actions,
      recent: readRecent(),
      here: { book: reader.book, chapter: reader.chapter },
      phone: isMobile,
      translationId: reader.translationId,
      translationAbbr: (id) => reader.translations.find((tr) => tr.id === id)?.abbreviation ?? id,
      colorLabel,
      colorWords: (c) => [i18n.t(`menu.colors.${c}`), ...both(`menu.colors.${c}`)],
      labels: {
        closest: t("palette.closest"),
        morePassages: (n) => t("palette.morePassages", { count: n }),
        invalid: t("nav.jumpInvalid"),
        noMatches: (q) => t("palette.noMatches", { q }),
        noTextSearch: t("palette.noTextSearch"),
        focusColor: (name) => t("palette.focusColor", { name }),
        colorDetail: (n) => t("palette.colorDetail", { count: n }),
        untitled: t("palette.untitled"),
        mark: t("palette.kindMark"),
        continueAt: (place, page) =>
          page ? t("place.continueAtPage", { place, page: page + 1 }) : t("place.continueAt", { place }),
        startLine: (line) => t(`place.lines.${line}`),
        compareRef: (ref) => t("palette.compareRef", { ref }),
      },
    });
    // actions is rebuilt each render; its labels follow the state it reads
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query, notes, annotations, highlights, tags, locale, reader, t, nameOf, colorLabel, isMobile, recentRev, actions.map((a) => a.label + a.checked).join()]);

  const selectable = items.map((it, i) => (it.disabled ? -1 : i)).filter((i) => i >= 0);
  // The first selectable row is highlighted while typing (Enter = top row);
  // on a phone none before typing (spec 4: a finger picks, not Enter)
  const empty = !query.trim();
  useEffect(() => setActive(isMobile && empty ? -1 : (selectable[0] ?? -1)), [query, open]); // eslint-disable-line react-hooks/exhaustive-deps
  // Enter typed ahead (open-palette.ts): go to the top row once it's there
  const [submitAhead, setSubmitAhead] = useState(false);
  useEffect(() => {
    if (!open) {
      setQuery("");
      setTipsOpen(false);
      setSubmitAhead(false);
    }
  }, [open]);

  // Keep the highlighted row in view
  useEffect(() => {
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, listId]);

  function run(item: PaletteItem, newTab = false) {
    if (item.disabled) return;
    if (item.compare) {
      // The dialog over the reader, which stays where it is
      const range = item.compare;
      nextFocus.current = "none";
      afterClose.current = () => openCompare({ range, returnTo: paletteOpener() });
      closeVia();
      return;
    }
    if (item.filterColor) {
      // As the colour key: this colour in full, the others faded; undoable
      const prev = filter;
      setHighlightFilter(new Set([item.filterColor]));
      toast(t("colourKey.showing", { colors: colorTitle(item.filterColor) }), {
        duration: 8000,
        action: { label: t("toast.undo"), onClick: () => setHighlightFilter(prev) },
      });
      nextFocus.current = "text";
      closeVia();
      return;
    }
    if (item.action) {
      const a = actions.find((x) => x.id === item.action);
      if (!a) return;
      if (a.keepOpen) {
        a.run();
        return;
      }
      if (a.id === "prev" || a.id === "next") {
        nextFocus.current = "text";
        leave((a.id === "prev" ? reader.prevHref : reader.nextHref)!);
      } else if (a.opensDialog) {
        nextFocus.current = "none";
        afterClose.current = a.run;
        closeVia();
      } else {
        a.run();
        closeVia();
      }
      return;
    }
    if (!item.href) return;
    // A margin note in another version: read in that one (the reader's sticky
    // choice, as the translation chooser sets it), so it's there on arrival
    if (item.translationId) localStorage.setItem("translationId", item.translationId);
    if (newTab) {
      window.open(item.href, "_blank", "noopener");
      return;
    }
    nextFocus.current = "text";
    leave(item.href);
  }

  useEffect(() => {
    if (!submitAhead) return;
    const i = selectable[0];
    if (isMobile && empty) return setSubmitAhead(false); // phone: Enter on nothing typed does nothing
    if (i === undefined) return; // results still coming
    setSubmitAhead(false);
    run(items[i]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once results exist
  }, [submitAhead, items]);

  function move(dir: 1 | -1) {
    if (selectable.length === 0) return;
    const i = selectable.indexOf(active);
    setActive(selectable[(i + dir + selectable.length) % selectable.length]);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || (e.ctrlKey && e.key === "n")) {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowUp" || (e.ctrlKey && e.key === "p")) {
      e.preventDefault();
      move(-1);
    } else if (e.key === "Enter") {
      if (e.nativeEvent.isComposing) return; // the IME's own Enter
      e.preventDefault();
      const item = items[active];
      if (item) run(item, e.metaKey || e.ctrlKey);
    } else if (e.key === "Tab" && !e.shiftKey && items[active]?.complete) {
      e.preventDefault();
      setQuery(items[active].complete!);
    }
  }

  const here = `${nameOf(reader.book)} ${reader.chapter}`;
  const count = selectable.length;
  const quotesShown = items.some((it) => it.group === "highlights" || it.group === "annotations");
  // Result count for screen readers, settled (not every keystroke)
  const [status, setStatus] = useState("");
  useEffect(() => {
    const id = window.setTimeout(() => setStatus(count > 0 ? t("palette.count", { count }) : t("palette.noResults")), 400);
    return () => window.clearTimeout(id);
  }, [count, t]);

  // Rows by group, each a labelled role=group for screen readers
  const groups: { group: GroupId; rows: { item: PaletteItem; i: number }[] }[] = [];
  items.forEach((item, i) => {
    const last = groups[groups.length - 1];
    if (last?.group === item.group) last.rows.push({ item, i });
    else groups.push({ group: item.group, rows: [{ item, i }] });
  });

  function row(item: PaletteItem, i: number) {
    return (
      // Keyboard goes through the input (aria-activedescendant), as in any combobox
      // eslint-disable-next-line jsx-a11y/click-events-have-key-events
      <li
        key={item.id}
        id={`${listId}-${i}`}
        role="option"
        aria-selected={i === active}
        aria-disabled={item.disabled || undefined}
        aria-checked={item.checked}
        // Keep focus in the input; activation is a click (screen readers and
        // voice control send only click). Middle-click = new tab.
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => run(item, e.metaKey || e.ctrlKey)}
        onAuxClick={(e) => e.button === 1 && run(item, true)}
        onMouseMove={() => !item.disabled && active !== i && setActive(i)}
        className={cn(
          // scroll-mt: scrolled to while moving up, a row clears its group's sticky heading
          "flex min-h-10 scroll-mt-10 items-center gap-3 rounded-md px-3 py-2 max-sm:min-h-12",
          item.disabled ? "text-list text-muted-foreground" : "cursor-pointer",
          i === active && "bg-accent text-accent-foreground",
        )}
      >
        {item.color ? (
          <span className="flex size-4 shrink-0 items-center justify-center" aria-hidden>
            <span className="size-2.5 rounded-full" style={{ backgroundColor: HIGHLIGHT_SWATCH[item.color] }} />
          </span>
        ) : (
          GROUP_ICON[item.group] &&
          (() => {
            const Icon = GROUP_ICON[item.group]!;
            return (
              <Icon
                className={cn("size-4 shrink-0 text-muted-foreground", i === active && "text-accent-foreground")}
                aria-hidden
              />
            );
          })()
        )}
        <span className="min-w-0 flex-1">
          <span className={cn("block text-control max-sm:text-phone", item.group === "books" && "font-serif")}>
            <Marked text={item.label} match={item.match} />
            {item.color && !item.filterColor && !colorLabel(item.color) && (
              <span className="sr-only">{` (${colorNameOf(item.color)})`}</span>
            )}
          </span>
          {item.detail && (
            <span
              className={cn(
                "block text-meta text-muted-foreground",
                !item.disabled && "truncate",
                // Muted grey on the selected row's tint is under 4.5:1
                i === active && "text-accent-foreground",
              )}
            >
              <Marked text={item.detail} match={item.match} />
            </span>
          )}
        </span>
        {item.kind && (
          <span
            className={cn(
              "shrink-0 rounded border border-border px-1.5 text-meta leading-5 text-muted-foreground",
              i === active && "text-accent-foreground",
            )}
          >
            <Marked text={item.kind} match={item.match} />
          </span>
        )}
        {item.checked && <Check className="size-4 shrink-0" strokeWidth={2.5} aria-hidden />}
        {item.shortcut && (
          <kbd className="shrink-0 rounded border border-border bg-muted px-1.5 font-mono text-meta leading-5 text-muted-foreground pointer-coarse:hidden">
            {item.shortcut}
          </kbd>
        )}
        {i === active && !item.disabled && (
          <CornerDownLeft className="size-4 shrink-0 text-muted-foreground pointer-coarse:hidden" aria-hidden />
        )}
      </li>
    );
  }

  // "Ryd" (spec 4): forget the chapters read, undoable (≥6s)
  function clearRecents() {
    const was = clearRecent({ book: reader.book, chapter: reader.chapter });
    setRecentRev((r) => r + 1);
    inputRef.current?.focus();
    toast(t("palette.recentCleared"), {
      duration: 8000,
      action: {
        label: t("toast.undo"),
        onClick: () => {
          restoreRecent(was);
          setRecentRev((r) => r + 1);
        },
      },
    });
  }

  const input = (
    <input
      ref={inputRef}
      role="combobox"
      aria-expanded
      aria-controls={listId}
      aria-autocomplete="list"
      aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
      aria-label={t("palette.title")}
      placeholder={isMobile && shortHint ? t("palette.placeholderShort") : t("palette.placeholder")}
      autoComplete="off"
      autoCapitalize="off"
      autoCorrect="off"
      spellCheck={false}
      // Phone: the keyboard's blue "Søg" key (spec 5); type=text, never
      // type=search (WebKit's own cancel button, Esc-clears)
      inputMode={isMobile ? "search" : undefined}
      enterKeyHint={isMobile ? "search" : "go"}
      value={query}
      // Keys typed before it had focus (open-palette.ts) come in here;
      // writing carries on at their end
      onFocus={(e) => {
        const ahead = takeTypeahead();
        if (ahead.text) setQuery((q) => q + ahead.text);
        else e.currentTarget.setSelectionRange(query.length, query.length);
        if (ahead.enter) setSubmitAhead(true);
      }}
      onChange={(e) => {
        setSubmitAhead(false); // typing on: no stale Enter
        setQuery(e.target.value);
      }}
      onKeyDown={onKeyDown}
      className={
        isMobile
          ? cn(
              // A filled field: no underline; a 1px edge and, focused, a 2px ring (≥3:1).
            // px, not rem: large text keeps the field's room for the words
              "min-h-[44px] w-full min-w-0 rounded-[10px] bg-muted py-1 pl-[40px] text-phone ring-1 ring-muted-foreground/80 outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring",
              // Room for ⓧ only once there's text to clear
              query ? "pr-[44px]" : "pr-[12px]",
            )
          : cn(
              "h-12 min-w-0 flex-1 bg-transparent text-control placeholder:text-muted-foreground max-sm:h-14 max-sm:text-phone",
              focusTitle,
            )
      }
    />
  );

  // Phone, nothing typed: "Senest læst" heads the list with its "Ryd" — a
  // button can't sit in the listbox, so its heading sits just above it
  const recentAbove = isMobile && empty && groups[0]?.group === "recent";

  const list = (
    <ul id={listId} role="listbox" aria-label={t("palette.title")} className="px-1.5 pb-1.5">
      {groups.map(({ group, rows }, g) => {
        const heading = GROUP_LABEL[group];
        if (!heading) return rows.map(({ item, i }) => row(item, i));
        const hid = `${listId}-g-${group}`;
        const Icon = GROUP_ICON[group];
        return (
          // A section: a rule above it (not the first), its heading in
          // full ink with its icon, staying put while its rows scroll
          <li key={`${group}-${g}`} role="presentation" className={cn(g > 0 && "mt-1.5 border-t border-border")}>
            {!(recentAbove && g === 0) && (
              <div
                className={cn(
                  "sticky top-0 z-10 -mx-1.5 flex items-center gap-2 px-4.5 pt-3 pb-1.5 text-meta font-semibold text-foreground",
                  isMobile ? "bg-background" : "bg-popover",
                )}
                aria-hidden
              >
                {Icon && <Icon className="size-3.5 shrink-0 text-primary" strokeWidth={2.25} />}
                <span id={hid}>{t(heading)}</span>
                <span className="ml-auto font-normal text-muted-foreground tabular-nums">{rows.length}</span>
              </div>
            )}
            <ul role="group" aria-labelledby={hid}>
              {rows.map(({ item, i }) => row(item, i))}
            </ul>
          </li>
        );
      })}
    </ul>
  );

  // How to search: folded, and only before typing or when nothing's found
  // (outside the listbox: a listbox holds only options)
  const showTips = !query.trim() || count === 0;
  const tipsList = tipsOpen && (
    <dl id={`${listId}-tips`} className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 px-1.5 pt-1 pb-2 text-meta">
      {TIPS.map((k) => (
        <div key={k} className="contents">
          <dt className="font-mono text-foreground">{t(`palette.tip.${k}`)}</dt>
          <dd className="text-muted-foreground">{t(`palette.tip.${k}Says`)}</dd>
        </div>
      ))}
      <div className="contents pointer-coarse:hidden">
        <dt className="font-mono text-foreground">↑ ↓ ↵</dt>
        <dd className="text-muted-foreground">{t("palette.tip.keysSays", { mod: modKey() })}</dd>
      </div>
    </dl>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next, details) => {
        // Esc with text typed clears it first; a second Esc closes
        if (!next && details?.reason === "escape-key" && query) {
          details.cancel();
          setQuery("");
          return;
        }
        // Phone: every close unwinds our history entry first (spec 8)
        if (!next && isMobile) {
          details?.cancel();
          closeVia();
          return;
        }
        onOpenChange(next);
      }}
      onOpenChangeComplete={(isOpen) => {
        if (isOpen) return;
        const fn = afterClose.current;
        afterClose.current = null;
        fn?.();
      }}
    >
      <DialogContent
        showCloseButton={false}
        variant={isMobile ? "screen" : "card"}
        initialFocus={inputRef}
        finalFocus={() => {
          if (nextFocus.current === "none") return false;
          if (nextFocus.current === "text") return document.getElementById("chapter-text") ?? true;
          const opener = paletteOpener();
          if (opener?.isConnected) return opener;
          // Phone: the Søg that opened it, else the text (spec 8)
          return (isMobile && document.getElementById("chapter-text")) || true;
        }}
        className={
          isMobile ? undefined : cn("flex flex-col gap-0 overflow-hidden p-0", "top-[12dvh] max-h-[76dvh] translate-y-0 sm:max-w-xl")
        }
      >
        <DialogTitle className="sr-only">{t("palette.title")}</DialogTitle>
        {isMobile ? (
          // The column follows the visible area (keyboard up, iOS pan)
          <div
            ref={setColumn}
            // Sides: clear of a landscape notch (#251)
            className="flex flex-col overflow-hidden pr-(--safe-right) pl-(--safe-left)"
            style={{ height: "var(--vv-h, 100%)", transform: "translate3d(0, var(--vv-top, 0px), 0)" }}
          >
            <div
              className={cn(
                "flex shrink-0 items-center gap-[8px] border-b px-[16px] pt-[var(--safe-top)] transition-[border-color] duration-[120ms] motion-reduce:transition-none",
                scrolled ? "border-border" : "border-transparent",
              )}
            >
              {/* The field comes first: at least 60% of the bar at any text size */}
              <div className="relative flex min-h-[56px] min-w-[60%] flex-1 items-center">
                <Search className="pointer-events-none absolute left-[12px] size-[18px] text-muted-foreground" aria-hidden />
                {input}
                {query && (
                  <button
                    type="button"
                    aria-label={t("palette.clearSearch")}
                    // The keyboard stays up: focus never leaves the field
                    onPointerDown={(e) => e.preventDefault()}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setQuery("");
                      inputRef.current?.focus();
                    }}
                    className="absolute right-0 flex size-[44px] items-center justify-center rounded-[10px] text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <CircleX className="size-[18px]" aria-hidden />
                  </button>
                )}
              </div>
              <button
                type="button"
                aria-label={t("palette.cancelTo", { ref: here })}
                onClick={closeVia}
                // Grows with large text only to 18px: the field keeps its room
                className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-md px-1 text-[clamp(16px,1rem,18px)] leading-tight font-semibold text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {t("palette.cancel")}
              </button>
            </div>
            <div role="status" className="sr-only">
              {status}
            </div>
            <ScrollArea
              className="min-h-0 flex-1"
              viewportRef={viewportRef}
              // The list ends above the home indicator, or the keyboard (#251)
              viewportClassName="overscroll-contain pb-[var(--vv-safe-bottom,var(--safe-bottom))]"
            >
              {recentAbove && (
                <div className="flex items-center gap-2 px-4.5 pt-3 pb-1.5 text-meta font-semibold text-foreground">
                  <History className="size-3.5 shrink-0 text-primary" strokeWidth={2.25} aria-hidden />
                  <span id={`${listId}-g-recent`} aria-hidden>
                    {t(GROUP_LABEL.recent)}
                  </span>
                  <button
                    type="button"
                    aria-label={t("palette.clearRecentName")}
                    onPointerDown={(e) => e.preventDefault()}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={clearRecents}
                    className="-my-3 -mr-2.5 ml-auto flex min-h-11 min-w-11 items-center justify-end rounded-md px-2.5 text-list font-normal text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {t("palette.clearRecent")}
                  </button>
                </div>
              )}
              {list}
              {/* Marked words quote Bible text: its copyright link (ToS §7.2) */}
              {quotesShown && (
                <ScriptureCredit
                  className="px-4 pt-5 text-list"
                  replace={entryOnTop()}
                  onFollow={() => {
                    entry.current = null;
                    onOpenChange(false);
                  }}
                />
              )}
              {/* Søgetips: the last thing in the list, not a pinned footer */}
              {showTips && (
                <div className="px-2.5 pt-5 pb-4">
                  <button
                    type="button"
                    aria-expanded={tipsOpen}
                    aria-controls={`${listId}-tips`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setTipsOpen((o) => !o)}
                    className="flex min-h-11 items-center gap-1 rounded-md px-1.5 text-list text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <ChevronRight className={cn("size-3.5 transition-transform motion-reduce:transition-none", tipsOpen && "rotate-90")} aria-hidden />
                    {t("palette.tips")}
                  </button>
                  {tipsList}
                </div>
              )}
            </ScrollArea>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 border-b border-border px-3">
              <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              {input}
              {/* A worded way out on every screen (an iPad without keyboard too) */}
              <Button variant="outline" size="sm" className="shrink-0" onClick={() => onOpenChange(false)}>
                <span className="pointer-coarse:hidden">{t("palette.close")}</span>
                <span className="hidden pointer-coarse:inline">{t("palette.backTo", { ref: here })}</span>
              </Button>
            </div>
            <div role="status" className="sr-only">
              {status}
            </div>
            <ScrollArea className="min-h-0 flex-1" viewportClassName="max-h-[min(60dvh,28rem)]">
              {list}
            </ScrollArea>
            {/* Marked words quote Bible text: its copyright link (ToS §7.2) */}
            {quotesShown && (
              <ScriptureCredit className="border-t border-border px-4.5 py-2" onFollow={() => onOpenChange(false)} />
            )}
            {showTips && (
              <div className="border-t border-border px-1.5 py-1">
                <button
                  type="button"
                  aria-expanded={tipsOpen}
                  aria-controls={`${listId}-tips`}
                  // A click keeps typing in the field (↑/↓ still work); Tab reaches it too
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setTipsOpen((o) => !o)}
                  className="flex min-h-8 items-center gap-1 rounded-md px-1.5 text-meta text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none max-sm:min-h-11"
                >
                  <ChevronRight className={cn("size-3.5 transition-transform motion-reduce:transition-none", tipsOpen && "rotate-90")} aria-hidden />
                  {t("palette.tips")}
                </button>
                {tipsList}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
