import { BOOKS, getBook } from "@biblestdy/shared";
import { ArrowLeft, ChevronDown, CornerDownLeft, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";
import { Hint } from "~/components/hint";
import { Button } from "~/components/ui/button";
import { Drawer, DrawerContent, DrawerTitle } from "~/components/lazy-drawer";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "~/components/ui/popover";
import { ScrollArea } from "~/components/ui/scroll-area";
import { useIsMobile } from "~/hooks/use-mobile";
import { bookLocale, useBookName } from "~/lib/book-name";
import { opensPlaceChooser } from "~/lib/shortcuts";
import { cn, focusRing } from "~/lib/utils";
import { PanelHeader, panelTitleClass } from "./panel-header";
import { filterPlaces, placeLabel } from "./place-filter";

type Step = "books" | "chapters";

/** Event name: anything (the command palette) can open the address chooser. */
export const OPEN_PLACE = "biblestdy:place";

const TESTAMENTS = [
  { key: "place.oldTestament", ids: new Set<string>(BOOKS.slice(0, 39).map((b) => b.id)) },
  { key: "place.newTestament", ids: new Set<string>(BOOKS.slice(39).map((b) => b.id)) },
] as const;

/** The current place, one mark everywhere (the strip's): ink, weight, a 2px
 * rule under it in --primary (gold in Paper, ink in Clean). Never a fill. */
const CURRENT = "font-semibold text-foreground underline decoration-primary decoration-2 underline-offset-4";

/**
 * The address (persona panel 2026-11-15): where you are, "Salmerne 23 ⌄",
 * and the one pointer route to any book and chapter. Opens a chooser: a
 * filter on top (the palette's matcher and parser — "sal 23" ↵ goes there),
 * the books (Old/New Testament, reading down the columns), then that book's
 * chapters in the same panel. Nothing loads until a chapter is picked.
 * Opens on the books where the sheet's chapter strip already offers the
 * chapters, else on this book's chapters ("← All books" one tap away).
 * Popover on desktop, bottom sheet on phones; Ctrl/⌘B opens it on the books
 * with the filter focused.
 */
export function PlaceChooser({
  book,
  chapter,
  stripShown = false,
  ref,
  style,
}: {
  /** "" when the route's book is unknown (error shell). */
  book: string;
  chapter: number;
  /** The paged sheet's chapter strip shows: open on the books. */
  stripShown?: boolean;
  /** The row's flexible part (nav-fit measures everything else). */
  ref?: React.Ref<HTMLButtonElement>;
  style?: React.CSSProperties;
}) {
  const { t } = useTranslation();
  const nameOf = useBookName();
  const isMobile = useIsMobile();
  const known = !!getBook(book);
  const [isOpen, setOpen] = useState(false);
  const open = isOpen;
  // How it was opened decides the first step and where focus starts
  const [start, setStart] = useState<{ step: Step; typing: boolean }>({ step: "books", typing: false });

  function show(typing: boolean) {
    setStart({ step: typing || stripShown || !known ? "books" : "chapters", typing });
    setOpen(true);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!opensPlaceChooser(e)) return;
      e.preventDefault();
      if (isOpen) setOpen(false);
      else show(true);
    }
    const open = () => show(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_PLACE, open);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_PLACE, open);
    };
  });

  const place = known ? `${nameOf(book)} ${chapter}` : t("place.noBook");
  const label = t("place.label", { place });
  const trigger = (
    <>
      {known ? (
        <>
          <span className="min-w-0 truncate font-serif font-medium">{nameOf(book)}</span>
          <span className="shrink-0 font-serif font-medium tabular-nums">{chapter}</span>
        </>
      ) : (
        <span className="min-w-0 truncate">{place}</span>
      )}
      <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </>
  );
  const triggerClass = "-ml-1 min-w-0 justify-start gap-1.5 pl-1.5 text-control";
  const panel = (
    <PlacePanel
      book={known ? book : ""}
      chapter={chapter}
      startStep={start.step}
      focusFilter={!isMobile || start.typing}
      onDone={() => setOpen(false)}
    />
  );

  return (
    <Popover
      open={open && !isMobile}
      onOpenChange={(next) => {
        // Phones: the trigger opens the sheet below (the popover stays shut)
        if (next) show(false);
        else setOpen(false);
      }}
    >
      <Hint label={t("place.choose")} shortcut="mod+B">
        <PopoverTrigger
          render={
            <Button
              ref={ref}
              variant="ghost"
              size="sm"
              data-nav-book=""
              aria-label={label}
              aria-haspopup="dialog"
              style={style}
              className={triggerClass}
            />
          }
        >
          {trigger}
        </PopoverTrigger>
      </Hint>
      {!isMobile && (
        <PopoverContent align="start" className="w-[44rem] max-w-[calc(100vw-2rem)] gap-0 p-0">
          <PopoverTitle className="sr-only">{t("place.choose")}</PopoverTitle>
          {panel}
        </PopoverContent>
      )}
      {isMobile && (
        <Drawer open={open} onOpenChange={setOpen} showSwipeHandle>
          <DrawerContent className="[--drawer-content-max-height:92dvh]">
            <PanelHeader onClose={() => setOpen(false)} closeLabel={t("place.close")}>
              <DrawerTitle className={panelTitleClass}>{t("place.choose")}</DrawerTitle>
            </PanelHeader>
            {panel}
          </DrawerContent>
        </Drawer>
      )}
    </Popover>
  );
}

/** Filter + books, then a book's chapters — one panel, two steps. */
function PlacePanel({
  book,
  chapter,
  startStep,
  focusFilter,
  onDone,
}: {
  book: string;
  chapter: number;
  startStep: Step;
  focusFilter: boolean;
  onDone: () => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = bookLocale(i18n.language);
  const nameOf = useBookName();
  const navigate = useNavigate();
  const ids = useId();
  const [query, setQuery] = useState("");
  const [step, setStep] = useState<Step>(startStep);
  const [stepBook, setStepBook] = useState(book || "GEN");
  const filter = useMemo(() => filterPlaces(query, locale), [query, locale]);
  // The option Enter picks (combobox active descendant)
  const [active, setActive] = useState<string | null>(null);
  const activeId = active && filter.books.includes(active) ? active : (filter.best ?? (query ? null : book || null));
  const inputRef = useRef<HTMLInputElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLUListElement>(null);

  // First focus: the filter (desktop, Ctrl+B) or this chapter (phones)
  useEffect(() => {
    requestAnimationFrame(() => {
      if (focusFilter) inputRef.current?.focus();
      else if (startStep === "chapters") focusChapter();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on open
  }, []);

  // The active book stays in view (manual: scrollIntoView could move the locked body)
  useEffect(() => {
    if (step !== "books" || !activeId) return;
    const vp = viewport.current?.querySelector<HTMLElement>("[data-slot=scroll-area-viewport]");
    const el = vp?.querySelector<HTMLElement>(`[data-book="${activeId}"]`);
    if (!vp || !el) return;
    const top = el.getBoundingClientRect().top - vp.getBoundingClientRect().top;
    if (top < 0 || top + el.offsetHeight > vp.clientHeight) vp.scrollTop += top - vp.clientHeight / 3;
  }, [activeId, step]);

  function focusChapter() {
    requestAnimationFrame(() => {
      const links = grid.current?.querySelectorAll<HTMLElement>("a");
      const here = grid.current?.querySelector<HTMLElement>("[aria-current=page]");
      (here ?? links?.[0])?.focus();
    });
  }

  function pickBook(id: string) {
    if ((getBook(id)?.chapters ?? 1) === 1) {
      onDone();
      void navigate(`/read/${id}/1`);
      return;
    }
    setStepBook(id);
    setActive(id);
    setStep("chapters");
    focusChapter();
  }

  function backToBooks() {
    setStep("books");
    setActive(stepBook);
    // Desktop: back in the filter. Phones: on the list (the filter would
    // raise the keyboard over it)
    setTimeout(() =>
      (focusFilter ? inputRef.current : viewport.current?.querySelector<HTMLElement>("[role=listbox]"))?.focus(),
    );
  }

  // Esc on the chapters goes back to the books first; a second Esc closes
  function onPanelKey(e: React.KeyboardEvent) {
    if (e.key !== "Escape" || step !== "chapters") return;
    e.preventDefault();
    e.stopPropagation();
    backToBooks();
  }

  function onInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    const list = filter.books;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (step !== "books" || list.length === 0) return;
      e.preventDefault();
      const at = activeId ? list.indexOf(activeId) : -1;
      const to = e.key === "ArrowDown" ? Math.min(list.length - 1, at + 1) : Math.max(0, at - 1);
      setActive(list[to]);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filter.passage && (!active || active === filter.passage.book)) {
        onDone();
        void navigate(filter.passage.href);
      } else if (activeId) pickBook(activeId);
    }
  }

  // Arrow keys move through the chapter grid by its visual rows (one tab stop)
  function onGridKey(e: React.KeyboardEvent) {
    const links = [...(grid.current?.querySelectorAll<HTMLElement>("a") ?? [])];
    const at = links.indexOf(document.activeElement as HTMLElement);
    if (at < 0) return;
    const cols = Math.max(1, links.filter((l) => l.offsetTop === links[0].offsetTop).length);
    const to = { ArrowLeft: at - 1, ArrowRight: at + 1, ArrowUp: at - cols, ArrowDown: at + cols, Home: 0, End: links.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    links[Math.max(0, Math.min(links.length - 1, to))]?.focus();
  }

  const hint = filter.passage
    ? placeLabel(filter.passage, locale)
    : step === "books" && activeId && query
      ? nameOf(activeId)
      : null;
  const count = getBook(stepBook)?.chapters ?? 1;

  return (
    <div role="presentation" data-place-step={step} onKeyDown={onPanelKey} className="flex min-h-0 flex-1 flex-col">
      {/* The filter: the palette's underline field, not a boxed form */}
      <div className="flex shrink-0 flex-col border-b border-border px-3">
        <div className="flex items-center gap-2">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            ref={inputRef}
            data-place-filter=""
            type="text"
            role="combobox"
            aria-label={t("place.filter")}
            aria-expanded={step === "books"}
            aria-controls={`${ids}-books`}
            aria-autocomplete="list"
            aria-activedescendant={step === "books" && activeId ? `${ids}-${activeId}` : undefined}
            aria-describedby={hint ? `${ids}-hint` : undefined}
            placeholder={t("place.placeholder")}
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(null);
              if (step !== "books") setStep("books");
            }}
            onKeyDown={onInputKey}
            className="h-10 min-w-0 flex-1 bg-transparent text-control outline-none placeholder:text-muted-foreground max-sm:text-phone"
          />
        </div>
        {hint && (
          <p id={`${ids}-hint`} className="-mt-1 flex items-center gap-1.5 pb-1.5 pl-6 text-meta text-muted-foreground">
            <CornerDownLeft className="size-3.5" aria-hidden />
            {t("place.enterOpens", { place: hint })}
          </p>
        )}
      </div>

      <div ref={viewport} className="flex min-h-0 flex-1 flex-col">
        <ScrollArea className="min-h-0 flex-1" viewportClassName="max-h-[min(80dvh,46rem)] max-sm:max-h-[60dvh]">
          {step === "books" ? (
            <div id={`${ids}-books`} role="listbox" tabIndex={-1} aria-label={t("place.books")} className="@container px-2 pt-1 pb-3 outline-none">
              {filter.books.length === 0 && (
                <p role="presentation" className="px-2 py-3 text-control text-muted-foreground">
                  {t("place.noMatch", { q: query.trim() })}
                </p>
              )}
              {TESTAMENTS.map(({ key, ids: inTestament }) => {
                const books = filter.books.filter((id) => inTestament.has(id));
                if (books.length === 0) return null;
                return (
                  <div key={key} role="group" aria-labelledby={`${ids}-${key}`}>
                    <div id={`${ids}-${key}`} className="eyebrow sticky top-0 z-10 bg-popover px-2 pt-3 pb-1">
                      {t(key)}
                    </div>
                    {/* Columns read downwards like a contents page, and ↑/↓ follow them */}
                    <div className="columns-2 gap-x-1 @min-[30rem]:columns-3 @min-[40rem]:columns-4">
                      {books.map((id) => {
                        const current = id === book;
                        return (
                          // Combobox options (the filter keeps focus, aria-activedescendant
                          // points here): keys live on the input, so no tab stop or key handler
                          // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus
                          <div
                            key={id}
                            id={`${ids}-${id}`}
                            role="option"
                            data-book={id}
                            aria-selected={id === activeId}
                            onClick={() => pickBook(id)}
                            onPointerMove={() => id !== activeId && setActive(id)}
                            className={cn(
                              "flex min-h-8 cursor-pointer break-inside-avoid items-center rounded-sm px-2 font-serif text-control max-sm:min-h-11",
                              id === activeId && query ? "bg-muted" : "hover:bg-muted",
                              current && CURRENT,
                            )}
                          >
                            {nameOf(id)}
                            {current && <span className="sr-only"> ({t("place.current")})</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <nav aria-label={t("reader.stripLabel", { book: nameOf(stepBook) })} className="px-3 pt-2 pb-4">
              {/* The grid's arrow keys (the links stay plain links in a list) */}
              <div role="presentation" onKeyDown={onGridKey}>
              <div className="mb-2 flex items-center gap-2">
                <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground max-sm:h-11" onClick={backToBooks}>
                  <ArrowLeft data-icon="inline-start" aria-hidden />
                  {t("place.allBooks")}
                </Button>
                <h2 className="min-w-0 truncate font-serif text-control font-semibold">{nameOf(stepBook)}</h2>
              </div>
              <ul
                ref={grid}
                className="grid grid-cols-[repeat(auto-fill,minmax(2.5rem,1fr))] gap-1 max-sm:grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))]"
              >
                {Array.from({ length: count }, (_, i) => i + 1).map((n) => {
                  const current = stepBook === book && n === chapter;
                  // One tab stop: this chapter (or the first); arrows reach the rest
                  const stop = current || (n === 1 && !(stepBook === book && chapter <= count));
                  return (
                    <li key={n}>
                      <Link
                        to={`/read/${stepBook}/${n}`}
                        onClick={onDone}
                        tabIndex={stop ? 0 : -1}
                        aria-current={current ? "page" : undefined}
                        aria-label={t("reader.stripChapter", { n })}
                        className={cn(
                          "flex size-10 items-center justify-center rounded-sm text-list tabular-nums hover:bg-muted max-sm:size-11",
                          focusRing,
                          current ? CURRENT : "text-foreground",
                        )}
                      >
                        {n}
                      </Link>
                    </li>
                  );
                })}
              </ul>
              </div>
            </nav>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}
