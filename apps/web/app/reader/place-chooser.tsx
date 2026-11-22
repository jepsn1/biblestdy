import { BOOKS, chapterCount, getBook, type Scheme } from "@biblestdy/shared";
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
import { placesToOffer, readRecent, START_PLACES } from "~/lib/recent-passages";
import { referenceLabel } from "~/lib/reference-label";
import { opensPlaceChooser } from "~/lib/shortcuts";
import { cn, focusRing } from "~/lib/utils";
import { PanelHeader, panelTitleClass } from "./panel-header";
import { chapterHref } from "./chapter-nav";
import { canonGroups, filterPlaces, placeLabel } from "./place-filter";

type Step = "books" | "chapters";

/** Event name: anything (the command palette) can open the address chooser. */
export const OPEN_PLACE = "biblestdy:place";

/** OPEN_PLACE's detail: open on this book's chapters (the strip's "All
 * chapters", #147), focus back on `from` when it closes. */
export type OpenPlace = { step?: "chapters"; from?: HTMLElement | null };

/** Open the address chooser from anywhere. */
export function openPlace(detail: OpenPlace = {}) {
  window.dispatchEvent(new CustomEvent<OpenPlace>(OPEN_PLACE, { detail }));
}

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
  chapterTo = null,
  stripShown = false,
  scheme = "eng",
}: {
  /** "" when the route's book is unknown (error shell). */
  book: string;
  chapter: number;
  /** The spread runs on to this chapter (#146): "Salmerne 23–24". */
  chapterTo?: number | null;
  /** The paged sheet's chapter strip shows: open on the books. */
  stripShown?: boolean;
  /** The reading translation's numbering (BPH: Joel 4, Malachi 3). */
  scheme?: Scheme;
}) {
  const { t } = useTranslation();
  const nameOf = useBookName();
  const isMobile = useIsMobile();
  const known = !!getBook(book);
  const [isOpen, setOpen] = useState(false);
  const open = isOpen;
  // How it was opened decides the first step and where focus starts
  const [start, setStart] = useState<{ step: Step; typing: boolean }>({ step: "books", typing: false });
  // Opened from elsewhere (the strip): focus goes back there on close
  const returnTo = useRef<HTMLElement | null>(null);

  function show(typing: boolean, step?: Step) {
    if (!step) returnTo.current = null;
    setStart({ step: step ?? (typing || stripShown || !known ? "books" : "chapters"), typing });
    setOpen(true);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!opensPlaceChooser(e)) return;
      e.preventDefault();
      if (isOpen) setOpen(false);
      else show(true);
    }
    const open = (e: Event) => {
      const detail = (e as CustomEvent<OpenPlace | null>).detail;
      if (detail?.step === "chapters" && known) {
        returnTo.current = detail.from ?? null;
        show(false, "chapters");
      } else show(true);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_PLACE, open);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_PLACE, open);
    };
  });

  const span = chapterTo && chapterTo > chapter ? `${chapter}–${chapterTo}` : String(chapter);
  // Said in words ("23 to 24"): a dash isn't read the same by every reader
  const spoken = chapterTo && chapterTo > chapter ? t("place.span", { from: chapter, to: chapterTo }) : String(chapter);
  const place = known ? `${nameOf(book)} ${spoken}` : t("place.noBook");
  const label = t("place.label", { place });
  const trigger = (
    <>
      {known ? (
        <>
          <span className="min-w-0 truncate font-serif font-medium">{nameOf(book)}</span>
          <span className="shrink-0 font-serif font-medium tabular-nums">{span}</span>
        </>
      ) : (
        <span className="min-w-0 truncate">{place}</span>
      )}
      <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </>
  );
  // The row's give: grows from 0 up to its own width and shrinks to 5em of
  // name (+ number, chevron, padding) — so the row wraps (last resort) only
  // when even that won't fit, never because the full name doesn't (#144)
  // (A short name — "Job", "Ruth" — is already that short: it keeps its width.)
  const short = !known || nameOf(book).length <= 8;
  const triggerClass = cn(
    "-ml-1 justify-start gap-1.5 pl-1.5 text-control",
    short ? "shrink-0" : "min-w-[calc(5em+3.5rem)] max-w-max shrink grow basis-0",
    // Phones (#262): the row never wraps; the name gives way (ellipsis), never the icons
    "max-md:min-w-0 max-md:shrink",
  );
  const panel = (
    <PlacePanel
      book={known ? book : ""}
      chapter={chapter}
      scheme={scheme}
      offerOnChapters={isMobile}
      startStep={start.step}
      focusFilter={start.typing || (!isMobile && !returnTo.current)}
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
              variant="ghost"
              size="sm"
              data-nav-book=""
              aria-label={label}
              aria-haspopup="dialog"
              className={triggerClass}
            />
          }
        >
          {trigger}
        </PopoverTrigger>
      </Hint>
      {!isMobile && (
        <PopoverContent
          align="start"
          finalFocus={() => (returnTo.current?.isConnected ? returnTo.current : true)}
          className="w-[44rem] max-w-[calc(100vw-2rem)] gap-0 p-0"
        >
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
  scheme,
  offerOnChapters,
  startStep,
  focusFilter,
  onDone,
}: {
  book: string;
  chapter: number;
  scheme: Scheme;
  /** Phones open on the chapters: Recent sits above them too (#142). */
  offerOnChapters: boolean;
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
    if (chapterCount(id, scheme) <= 1) {
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

  /** One book: a combobox option (the filter keeps focus, aria-activedescendant
   * points here): keys live on the input, so no tab stop or key handler. */
  const option = (id: string) => {
    const current = id === book;
    return (
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
  };

  const hint = filter.passage
    ? placeLabel(filter.passage, locale)
    : step === "books" && activeId && query
      ? nameOf(activeId)
      : null;
  const count = chapterCount(stepBook, scheme) || 1;

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
            <>
            {!query && <PlacesOffer book={book} chapter={chapter} onDone={onDone} />}
            <div id={`${ids}-books`} role="listbox" tabIndex={-1} aria-label={t("place.books")} className="@container px-2 pt-1 pb-3 outline-none">
              {filter.books.length === 0 && (
                <p role="presentation" className="px-2 py-3 text-control text-muted-foreground">
                  {t("place.noMatch", { q: query.trim() })}
                </p>
              )}
              {canonGroups(filter.books).map(({ testament, groups }) => {
                const tid = `${ids}-${testament}`;
                return (
                  <div key={testament} role="presentation">
                    <div id={tid} className="eyebrow sticky top-0 z-10 bg-popover px-2 pt-3 pb-1">
                      {t(testament === "old" ? "place.oldTestament" : "place.newTestament")}
                    </div>
                    {/* Columns read downwards like a contents page, and ↑/↓
                        follow them. The canon's groups (#143) flow in them,
                        each under a quiet label; a one-book group (Acts,
                        Revelation) is its own label: just the gap */}
                    <div className="columns-2 gap-x-1 @min-[30rem]:columns-3 @min-[40rem]:columns-4">
                      {groups.map(({ key, ids: books }, gi) => {
                        const gid = `${ids}-g-${key}`;
                        return (
                          <div key={key} role="group" aria-labelledby={`${tid} ${gid}`} className={cn(gi > 0 && "mt-3")}>
                            <div
                              id={gid}
                              className={cn("break-after-avoid px-2 py-0.5 text-meta text-muted-foreground", books.length === 1 && "sr-only")}
                            >
                              {t(`place.groups.${key}`)}
                            </div>
                            {books.map(option)}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            </>
          ) : (
            <>
            {offerOnChapters && <PlacesOffer book={book} chapter={chapter} onDone={onDone} />}
            <nav aria-label={t("reader.stripLabel", { book: nameOf(stepBook) })} className="px-3 pt-2 pb-4">
              {/* The grid's arrow keys (the links stay plain links in a list) */}
              <div role="presentation" onKeyDown={onGridKey}>
              <div className="mb-2 flex items-center gap-2">
                <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" onClick={backToBooks}>
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
            </>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}

/**
 * Where you were and where to start (#142), on top of the chooser while the
 * filter is empty: "Continue: John 3, page 2" (the newest place that isn't
 * this one) and up to four more read lately, as one line of worded links;
 * for a newcomer (under 3 chapters read), four good places to start, each
 * with a plain line that quotes the text or names the kind of book. This
 * device only (its label says so). Links, in Tab order after the filter.
 */
function PlacesOffer({ book, chapter, onDone }: { book: string; chapter: number; onDone: () => void }) {
  const { t, i18n } = useTranslation();
  const locale = bookLocale(i18n.language);
  const nameOf = useBookName();
  const id = useId();
  // Read once when the chooser opens (client only: it opens on a click)
  const [offer] = useState(() => placesToOffer(readRecent(), book ? { book, chapter } : null));
  const label = (r: { book: string; chapter: number }) => referenceLabel(r, nameOf, locale);
  const recent = offer.continueAt ? [offer.continueAt, ...offer.recent] : [];
  const starts = offer.start ? START_PLACES.filter((s) => s.book !== book || s.chapter !== chapter) : [];
  if (recent.length === 0 && starts.length === 0) return null;
  const link = cn("rounded-sm font-serif text-control hover:underline underline-offset-4", focusRing);
  return (
    <div className="flex flex-col gap-3 border-b border-border px-4 pt-3 pb-3">
      {recent.length > 0 && (
        <section aria-labelledby={`${id}-recent`}>
          <h2 id={`${id}-recent`} className="eyebrow pb-1">
            {t("place.recent")}
          </h2>
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-1">
            {recent.map((r, i) => (
              <li key={`${r.book}/${r.chapter}`}>
                <Link to={chapterHref(r, r.page ?? 0)} onClick={onDone} className={cn(link, "inline-flex min-h-8 items-center max-sm:min-h-11", i === 0 && "font-medium")}>
                  {i === 0
                    ? r.page
                      ? t("place.continueAtPage", { place: label(r), page: r.page + 1 })
                      : t("place.continueAt", { place: label(r) })
                    : label(r)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {starts.length > 0 && (
        <section aria-labelledby={`${id}-start`} className="@container">
          <h2 id={`${id}-start`} className="eyebrow pb-1">
            {t("place.start")}
          </h2>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1 @min-[30rem]:grid-cols-4">
            {starts.map((s) => (
              <li key={`${s.book}/${s.chapter}`}>
                <Link to={chapterHref(s)} onClick={onDone} className={cn(link, "flex min-h-11 flex-col justify-center py-1")}>
                  {label(s)}
                  <span className="font-sans text-meta text-muted-foreground">{t(`place.lines.${s.line}`)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
