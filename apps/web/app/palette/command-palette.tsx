import type { Tag, Translation } from "@biblestdy/shared";
import { TEXT_SIZES, translationInfo } from "@biblestdy/shared";
import { useQuery } from "@tanstack/react-query";
import { Check, CornerDownLeft, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { modKey } from "~/components/hint";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "~/components/ui/dialog";
import { ScrollArea } from "~/components/ui/scroll-area";
import { useSidebar } from "~/components/ui/sidebar";
import { useIsMobile } from "~/hooks/use-mobile";
import { bookLocale, useBookName } from "~/lib/book-name";
import i18n, { setUiLanguage } from "~/lib/i18n";
import { api } from "~/lib/query";
import { readRecent } from "~/lib/recent-passages";
import { saveReaderStyle, useReaderStyle } from "~/lib/reader-style";
import { setThemePref, THEME_PREFS, useThemePref } from "~/lib/theme";
import { saveTextSize, useTextSize } from "~/lib/text-size";
import { cn } from "~/lib/utils";
import { OPEN_SHORTCUTS } from "../reader/shortcuts-dialog";
import { OPEN_TRANSLATIONS, translationTitle } from "../reader/translation-chooser";
import { useAllNotesQuery } from "../reader/use-notes";
import { buildResults, type GroupId, type PaletteAction, type PaletteItem } from "./palette-results";

/** Event name: the nav's search button opens the palette. */
export const OPEN_PALETTE = "biblestdy:palette";

/** Where focus was when the palette opened (Esc returns there). */
let opener: HTMLElement | null = null;
export function openPalette() {
  opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  window.dispatchEvent(new Event(OPEN_PALETTE));
}

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
  const sidebar = useSidebar();
  const lang = i18n.language.startsWith("da") ? "da" : "en";
  const sizeIdx = TEXT_SIZES.indexOf(size);

  const isMobile = useIsMobile();
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
      id: "sidebar",
      label: t("nav.toggleSidebar"),
      keywords: both("nav.toggleSidebar"),
      shortcut: `${modKey()}B`,
      run: sidebar.toggleSidebar,
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
  ];
  return actions;
}

const GROUP_LABEL: Record<GroupId, string> = {
  recent: "palette.groupRecent",
  passage: "palette.groupPassage",
  books: "palette.groupBooks",
  actions: "palette.groupActions",
  notes: "palette.groupNotes",
  topics: "palette.groupTopics",
  hint: "",
};

/**
 * Command palette + omni search (⌘K / Ctrl+K anywhere, `/` when not typing):
 * one field → passages, books, your notes (by passage or words), topics and
 * reader actions. Keyboard-first (↑/↓, Enter, ⌘/Ctrl+Enter = new tab, Tab
 * completes a book, Esc closes); every row is clickable. Full screen on
 * phones with a worded way back. Never fetches scripture.
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

  // iOS doesn't shrink dvh for the keyboard: size the phone sheet to the visual viewport
  const [vvh, setVvh] = useState<number | null>(null);
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!open || !isMobile || !vv) return;
    const update = () => setVvh(vv.height);
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [open, isMobile]);

  const { notes } = useAllNotesQuery(open);
  const { data: tags = [] } = useQuery({
    queryKey: ["tags", "all"],
    queryFn: () => api<Tag[]>("/api/tags").catch(() => []),
    enabled: open,
  });
  const actions = useActions(reader);

  const items = useMemo(() => {
    if (!open) return [];
    return buildResults(query, {
      locale,
      bookName: nameOf,
      notes,
      tags,
      actions,
      recent: readRecent(),
      here: { book: reader.book, chapter: reader.chapter },
      translationId: reader.translationId,
      labels: {
        goTo: (ref) => t("palette.goTo", { ref }),
        emptyHint: t("palette.emptyHint"),
        morePassages: (n) => t("palette.morePassages", { count: n }),
        invalid: t("nav.jumpInvalid"),
        noTextSearch: t("palette.noTextSearch"),
        untitled: t("palette.untitled"),
      },
    });
    // actions is rebuilt each render; its labels follow the state it reads
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query, notes, tags, locale, reader, t, nameOf, actions.map((a) => a.label + a.checked).join()]);

  const selectable = items.map((it, i) => (it.disabled ? -1 : i)).filter((i) => i >= 0);
  // The first selectable row is highlighted while typing (Enter = top row)
  useEffect(() => setActive(selectable[0] ?? -1), [query, open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  // Keep the highlighted row in view
  useEffect(() => {
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, listId]);

  function run(item: PaletteItem, newTab = false) {
    if (item.disabled) return;
    if (item.action) {
      const a = actions.find((x) => x.id === item.action);
      if (!a) return;
      if (a.keepOpen) {
        a.run();
        return;
      }
      if (a.id === "prev" || a.id === "next") {
        nextFocus.current = "text";
        onOpenChange(false);
        navigate((a.id === "prev" ? reader.prevHref : reader.nextHref)!);
      } else if (a.opensDialog) {
        nextFocus.current = "none";
        afterClose.current = a.run;
        onOpenChange(false);
      } else {
        a.run();
        onOpenChange(false);
      }
      return;
    }
    if (!item.href) return;
    if (newTab) {
      window.open(item.href, "_blank", "noopener");
      return;
    }
    nextFocus.current = "text";
    onOpenChange(false);
    navigate(item.href);
  }

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
          "flex min-h-10 items-center gap-3 rounded-md px-3 py-2 max-sm:min-h-12",
          item.disabled ? "text-list text-muted-foreground" : "cursor-pointer",
          i === active && "bg-accent text-accent-foreground",
        )}
      >
        <span className="min-w-0 flex-1">
          <span className={cn("block text-control max-sm:text-phone", item.group === "books" && "font-serif")}>
            {item.label}
          </span>
          {item.detail && <span className="block truncate text-meta text-muted-foreground">{item.detail}</span>}
        </span>
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
        initialFocus={inputRef}
        finalFocus={() => {
          if (nextFocus.current === "none") return false;
          if (nextFocus.current === "text") return document.getElementById("chapter-text") ?? true;
          return opener?.isConnected ? opener : true;
        }}
        style={isMobile && vvh ? { height: vvh } : undefined}
        className={cn(
          "flex flex-col gap-0 overflow-hidden p-0",
          isMobile
            ? "inset-0 h-dvh max-w-none translate-x-0 translate-y-0 rounded-none"
            : "top-[12dvh] max-h-[76dvh] translate-y-0 sm:max-w-xl",
        )}
      >
        <DialogTitle className="sr-only">{t("palette.title")}</DialogTitle>
        {isMobile && (
          <Button variant="outline" className="m-3 mb-0 h-11 justify-start" onClick={() => onOpenChange(false)}>
            {t("palette.backTo", { ref: here })}
          </Button>
        )}
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
            aria-label={t("palette.title")}
            aria-describedby={`${listId}-hint`}
            placeholder={t("palette.placeholder")}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            className="h-12 min-w-0 flex-1 bg-transparent text-control outline-none placeholder:text-muted-foreground max-sm:h-14 max-sm:text-phone"
          />
          {/* A worded way out on every screen (an iPad without keyboard too) */}
          {!isMobile && (
            <Button variant="outline" size="sm" className="shrink-0" onClick={() => onOpenChange(false)}>
              <span className="pointer-coarse:hidden">{t("palette.close")}</span>
              <span className="hidden pointer-coarse:inline">{t("palette.backTo", { ref: here })}</span>
            </Button>
          )}
        </div>
        <div role="status" className="sr-only">
          {status}
        </div>
        <ScrollArea className="min-h-0 flex-1" viewportClassName={isMobile ? undefined : "max-h-[min(60dvh,28rem)]"}>
          <ul id={listId} role="listbox" aria-label={t("palette.title")} className="p-1.5">
            {groups.map(({ group, rows }) => {
              const heading = GROUP_LABEL[group];
              if (!heading) return rows.map(({ item, i }) => row(item, i));
              const hid = `${listId}-g-${group}`;
              return (
                <li key={group} role="presentation">
                  <div id={hid} className="eyebrow px-3 pt-3 pb-1" aria-hidden>
                    {t(heading)}
                  </div>
                  <ul role="group" aria-labelledby={hid}>
                    {rows.map(({ item, i }) => row(item, i))}
                  </ul>
                </li>
              );
            })}
          </ul>
        </ScrollArea>
        <p
          id={`${listId}-hint`}
          className="border-t border-border px-3 py-2 text-meta text-muted-foreground pointer-coarse:hidden"
        >
          {t("palette.footer", { mod: modKey() })}
        </p>
      </DialogContent>
    </Dialog>
  );
}
