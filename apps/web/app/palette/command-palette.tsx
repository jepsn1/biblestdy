import type { Tag, Translation } from "@biblestdy/shared";
import { TEXT_SIZES, translationInfo } from "@biblestdy/shared";
import { useQuery } from "@tanstack/react-query";
import { Check, CornerDownLeft, Search } from "lucide-react";
import { Fragment, useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
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
  const actions: (PaletteAction & { run: () => void; keepOpen?: boolean })[] = [
    {
      id: "translations",
      label: t("palette.chooseTranslation"),
      keywords: [...both("palette.chooseTranslation"), ...both("nav.translation")],
      shortcut: "T",
      common: true,
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
      label: t("palette.theme", { value: t(`theme.${p}`) }),
      keywords: [...both("settings.theme"), ...both(`theme.${p}`)],
      checked: theme === p,
      common: p !== theme && p !== "system",
      run: () => setThemePref(p),
    })),
    ...(["paper", "clean"] as const).map((s) => ({
      id: `style-${s}`,
      label: t("palette.style", { value: t(`readerStyle.${s}`) }),
      keywords: [...both("settings.style"), ...both(`readerStyle.${s}`)],
      checked: style === s,
      run: () => void saveReaderStyle(s),
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
      run: () => window.dispatchEvent(new Event(OPEN_SHORTCUTS)),
    }]),
  ];
  return actions;
}

const GROUP_LABEL: Record<GroupId, string> = {
  continue: "palette.groupContinue",
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
  // Esc returns focus to exactly where it was (a verse, the note editor…)
  const returnTo = useRef<HTMLElement | null>(null);
  if (open && returnTo.current === null && typeof document !== "undefined") {
    returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }
  if (!open) returnTo.current = null;

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
      lastRead: (() => {
        try {
          return localStorage.getItem("lastRead");
        } catch {
          return null;
        }
      })(),
      here: { book: reader.book, chapter: reader.chapter },
      labels: {
        goTo: (ref) => t("palette.goTo", { ref }),
        continueAt: (ref) => t("palette.continueAt", { ref }),
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
      if (a.id === "prev" && reader.prevHref) navigate(reader.prevHref);
      else if (a.id === "next" && reader.nextHref) navigate(reader.nextHref);
      else a.run();
      if (!a.keepOpen) onOpenChange(false);
      return;
    }
    if (!item.href) return;
    if (newTab) {
      window.open(item.href, "_blank", "noopener");
      return;
    }
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        initialFocus={inputRef}
        finalFocus={returnTo}
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
        </div>
        <div role="status" className="sr-only">
          {count > 0 ? t("palette.count", { count }) : t("palette.noResults")}
        </div>
        <ScrollArea className="min-h-0 flex-1" viewportClassName={isMobile ? undefined : "max-h-[min(60dvh,28rem)]"}>
          <ul id={listId} role="listbox" aria-label={t("palette.title")} className="p-1.5">
            {items.map((item, i) => {
              const first = i === 0 || items[i - 1].group !== item.group;
              const heading = GROUP_LABEL[item.group];
              return (
                <Fragment key={item.id}>
                  {first && heading && (
                    <li role="presentation" className="eyebrow px-3 pt-3 pb-1">
                      {t(heading)}
                    </li>
                  )}
                  <li
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={i === active}
                    aria-disabled={item.disabled || undefined}
                    aria-checked={item.checked}
                    // mousedown, not click: keep the input focused
                    onMouseDown={(e) => {
                      e.preventDefault();
                      run(item, e.metaKey || e.ctrlKey || e.button === 1);
                    }}
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
                      {item.detail && (
                        <span className="block truncate text-meta text-muted-foreground">{item.detail}</span>
                      )}
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
                </Fragment>
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
