import { getBook } from "@biblestdy/shared";
import { Select as SelectPrimitive } from "@base-ui/react/select";
import { LayoutGrid } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Hint } from "~/components/hint";
import { useBookName } from "~/lib/book-name";
import { cn, focusRing } from "~/lib/utils";
import { ChapterSelect } from "./chapter-select";
import { stripWindow } from "./strip-window";
import { turnStill } from "./turn-still";

/** One place in the row (rem): a 1.75rem target + the 0.25rem gap. */
const SLOT_REM = 2;
const ITEM = "[data-strip-item]";

/**
 * Chapter strip: the book's chapters as a running head over the paged text
 * block, as wide as it — click a number, read, click the next ("shop
 * through" a book). Quiet like the running foot it mirrors: small tabular
 * figures, the current chapter in ink with a gold rule under it (never
 * colour alone). Always ONE row of fixed height, so changing chapter never
 * re-lays out the columns; a book longer than the row shows its first and
 * last chapter, a run around this one (sticky: it stays put while you click
 * inside it, strip-window.ts) and "All chapters" — the full grid.
 * Keyboard: one tab stop (the current chapter), ←/→/Home/End move along the
 * row, Enter opens; Tab moves on. No prefetch on hover: shopping through a
 * book must not spend the reading quota (#29).
 * Chrome, not page: it stays put while the page turns (turn-still.ts).
 */
export function ChapterStrip({ book, chapter, className }: { book: string; chapter: number; className?: string }) {
  const { t } = useTranslation();
  const nameOf = useBookName();
  const count = getBook(book)?.chapters ?? 1;
  const navRef = useRef<HTMLElement>(null);
  const [slots, setSlots] = useState(0);

  // How many slots the row holds: its own width only, once per frame
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const measure = () => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      // +1 gap: the row's last slot has none after it
      setSlots(Math.floor((nav.clientWidth + 0.25 * rem) / (SLOT_REM * rem)));
    };
    measure();
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    });
    observer.observe(nav);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  // Sticky run: kept per book and row width (another book or a resize starts fresh)
  const kept = useRef<{ key: string; start: number | null }>({ key: "", start: null });
  const key = `${book}:${slots}`;
  const view = stripWindow({ count, current: chapter, slots, keep: kept.current.key === key ? kept.current.start : null });
  useEffect(() => {
    kept.current = { key, start: view.start };
  }, [key, view.start]);

  function onKeyDown(e: React.KeyboardEvent) {
    const items = [...(navRef.current?.querySelectorAll<HTMLElement>(ITEM) ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    if (at < 0) return;
    const to =
      e.key === "ArrowLeft" ? at - 1 : e.key === "ArrowRight" ? at + 1 : e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : null;
    if (to === null) return;
    // Handled: the reader's own ←/→/Home/End (page turns) stay out of it
    e.preventDefault();
    items[Math.max(0, Math.min(items.length - 1, to))]?.focus();
  }

  return (
    <nav ref={navRef} {...turnStill("strip")} aria-label={t("reader.stripLabel", { book: nameOf(book) })} className={cn("h-7 font-sans", className)}>
      {/* The row's keys (the links stay plain links in a nav) */}
      <div role="presentation" onKeyDown={onKeyDown} className="flex h-full items-center gap-1">
      {slots > 0 &&
        view.items.map((item) => {
          if (item.kind === "gap") {
            return (
              <span key={`gap-${item.side}`} aria-hidden className="w-7 shrink-0 text-center text-list text-muted-foreground">
                …
              </span>
            );
          }
          if (item.kind === "all") {
            return (
              <ChapterSelect key="all" book={book} chapter={chapter}>
                <Hint label={t("reader.allChapters")}>
                  <SelectPrimitive.Trigger
                    data-strip-item
                    tabIndex={-1}
                    aria-label={t("reader.allChapters")}
                    className={cn(STRIP_ITEM, "text-muted-foreground hover:bg-muted hover:text-foreground")}
                  >
                    <LayoutGrid aria-hidden className="size-3.5" />
                  </SelectPrimitive.Trigger>
                </Hint>
              </ChapterSelect>
            );
          }
          const current = item.n === chapter;
          return (
            <Link
              key={item.n}
              to={`/read/${book}/${item.n}`}
              data-strip-item
              // One tab stop: the current chapter; arrows reach the rest
              tabIndex={current ? 0 : -1}
              aria-current={current ? "page" : undefined}
              aria-label={t("reader.stripChapter", { n: item.n })}
              className={cn(
                STRIP_ITEM,
                "tabular-nums",
                current
                  ? "font-semibold text-foreground after:absolute after:inset-x-1.5 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {item.n}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

const STRIP_ITEM = cn(
  "relative inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-md px-0.5 text-list transition-colors",
  focusRing,
);
