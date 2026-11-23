import { getBook, type Scheme } from "@biblestdy/shared";
import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState, type ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import { Hint } from "~/components/hint";
import { Button } from "~/components/ui/button";
import { Drawer, DrawerContent, DrawerTitle } from "~/components/lazy-drawer";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "~/components/ui/popover";
import { useIsMobile } from "~/hooks/use-mobile";
import { useBookName } from "~/lib/book-name";
import { lazyModule, preloadWhenIdle, useLazyModule } from "~/lib/lazy-module";
import { opensPlaceChooser } from "~/lib/shortcuts";
import { cn } from "~/lib/utils";
import { PanelHeader, panelTitleClass } from "./panel-header";
import type { Step } from "./place-panel";

/** The panel (filter, books, chapters) is its own chunk (#277: the reader's
 * first-paint budget): only an open chooser shows it. Fetched when the page
 * is idle, or at the latest on the first touch of the trigger. */
const panelModule = lazyModule(() => import("./place-panel"));

function LazyPlacePanel(props: ComponentProps<typeof import("./place-panel").PlacePanel>) {
  const { value } = useLazyModule(panelModule);
  if (!value) return null;
  return <value.PlacePanel {...props} />;
}

/** Event name: anything (the command palette) can open the address chooser. */
export const OPEN_PLACE = "biblestdy:place";

/** OPEN_PLACE's detail: open on this book's chapters (the strip's "All
 * chapters", #147), focus back on `from` when it closes. */
export type OpenPlace = { step?: "chapters"; from?: HTMLElement | null };

/** Open the address chooser from anywhere. */
export function openPlace(detail: OpenPlace = {}) {
  window.dispatchEvent(new CustomEvent<OpenPlace>(OPEN_PLACE, { detail }));
}

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

  useEffect(() => preloadWhenIdle(panelModule), []);

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
  );
  const panel = (
    <LazyPlacePanel
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
              onPointerDown={panelModule.preload}
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

