import { Fragment, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Hint } from "~/components/hint";
import { Button } from "~/components/ui/button";
import { useLiveShortcut } from "~/lib/shortcuts";
import { COFFEE_URL } from "~/lib/support";
import { cn, focusRing } from "~/lib/utils";
import { openPaletteFromTap, palette } from "~/palette/open-palette";
import { lineWidth, partsThatFit } from "./sheet-layout";
import { ShareMenu } from "./share-menu";
import { turnStill } from "./turn-still";

/** One end of the foot. `label` is what it says; `name` its full accessible
 * name (starts with/contains the visible words). */
export type FootButton = {
  label: string;
  name: string;
  /** Tooltip key ("←") + aria-keyshortcuts ("ArrowLeft PageUp"); "" = none. */
  hintKey: string;
  keys: string;
  /** Nothing that way (Genesis 1's first page, Revelation 22's last). */
  disabled: boolean;
  onClick: () => void;
  /** A chapter it names ("Apostlenes Gerninger 3"): a narrow button cuts
   * the book's name short, never the number ("Apostlenes Gern… 3"). */
  place?: { book: string; chapter: string };
};

/**
 * Running foot: the reader's page-turn control, set like a printed book's
 * foot line directly under the text block and exactly as wide —
 * "‹ Previous" at the text's left edge, the folio ("3:11–21 · Page 2 of 4"
 * + credit) centred, "Next ›" at its right edge, right where a page's last
 * line ends. Quiet ghost buttons in the site's own chrome (rounded-lg,
 * muted hover), never a toolbar. The Bible reads as one book: from a
 * chapter's last page Next is simply the next chapter's first (only the
 * accessible name says where it crosses to), so the buttons never change
 * shape. They stay mounted (disabled, still focusable) so nothing shifts
 * and focus stays put while turning pages with Enter.
 * Phones (scroll mode) step chapters from the ChapterBar instead. It is
 * chrome: it stays put while the page turns (turn-still.ts).
 * Narrow (large text, a narrow window): the buttons keep their words and
 * the centre gives way, never over them — each line keeps its last part
 * (the page count, the copyright) and drops the parts before it that no
 * longer fit beside it (the verse range under the verses themselves, the
 * translation name in the header). The folio stays one line (truncated as
 * a last resort); a long copyright wraps, it is never cut.
 * "☕ Buy me a coffee · ↗ Share" (lib/support.ts, #182) always has a third
 * line of its own (folio / credit / support), centred and as quiet as the
 * credit — never on the credit line, so it never pushes the credit or source.
 * The foot always holds that line (the text column, flex-1 above it, gives
 * the room; the page count is measured with it). Phones end the chapter with
 * the same line (SupportLine), full touch targets.
 */
export function PageFoot({
  label,
  position,
  credit,
  creditLink,
  source,
  prev,
  next,
  spot,
  more,
  className,
}: {
  /** The open note's references on another page (#226): "1 more on p. 2 →"
   * after the folio, a button that turns there. The spotlight's exit line
   * outranks it (it takes the folio's place). */
  more?: { label: string; short: string; name: string; back: boolean; onTurn: () => void } | null;
  /** The reference spotlight's exit line (#210), in the folio's place while
   * it lasts: "Viser Joh 3,14–15 · Vis alt". Its announcement is the
   * reader's own live region. */
  spot?: { label: string; short: string; showAll: string; onEnd: () => void } | null;
  /** Landmark name: "Pages" / "Chapters". */
  label: string;
  /** Folio (paged: visual only, the live region announces turns): parts
   * joined by " · ", each kept whole when the line wraps. Empty: none. */
  position: string[];
  /** Translation credit, its parts kept whole the same way. */
  credit?: string[];
  /** Where the credit leads: the translation's entry on the copyright page
   * (ToS §7.2), and its accessible name's tail. */
  creditLink?: { href: string; more: string; from?: string };
  /** The text's source, cited last on the credit line as an outside link
   * (API.Bible Starter plan). Never dropped for room. */
  source?: { label: string; href: string; more: string };
  prev: FootButton;
  next: FootButton;
  className?: string;
}) {
  const credits = credit ?? [];
  // The source rides on the last part (measured with it): never dropped
  const measured = source && credits.length > 0 ? [...credits.slice(0, -1), `${credits.at(-1)}\u00a0·\u00a0${source.label}`] : credits;
  const arrow = (text: string) => (more?.back ? `\u2190\u00a0${text}` : `${text}\u00a0\u2192`);
  const moreText = more && arrow(more.label);
  // Kept last on the folio: the parts before it give way first
  const folio = moreText ? [...position, moreText] : position;
  const fit = useFit(folio, measured, spot ? [spot.label, spot.short, spot.showAll] : [], !!moreText);
  const kept = moreText ? Math.max(0, fit.position - 1) : fit.position;
  const creditLine = credits.length > 0 && (
    // Own line: as wide as the foot, never widening the folio's track
    <p className={cn(CREDIT, "text-balance", fit.creditWide && "col-span-3 w-0 min-w-full text-center")}>
      <CreditParts parts={credits.slice(-fit.credit)} link={creditLink} source={source} />
    </p>
  );
  return (
    <nav
      ref={fit.navRef}
      {...turnStill("foot")}
      aria-label={label}
      // Equal side tracks keep the folio centred under the text
      className={cn(
        // @container: an end is at most 45% of the foot (cqw), its book
        // name cut short past that, never pushing out of the text block
        "@container relative grid w-full grid-cols-[minmax(max-content,1fr)_minmax(0,auto)_minmax(max-content,1fr)] items-center gap-x-2 font-sans",
        className,
      )}
    >
      <FootEnd button={prev} dir="prev" />
      <div className="min-w-0 text-center">
        {spot ? (
          <p data-spot-line="" className={cn(FOLIO, "flex min-w-0 items-baseline justify-center")}>
            {/* "Viser Joh 3,14–15", or just the place where that won't fit */}
            <span aria-hidden className="truncate">
              {fit.spotFull ? spot.label : spot.short}
            </span>
            <span aria-hidden className="shrink-0 whitespace-pre">
              {SEP}
            </span>
            <button
              type="button"
              data-spot-exit=""
              data-spot-own=""
              onClick={spot.onEnd}
              className={cn(
                CREDIT_LINK,
                // 44px to hit (an invisible ring), the line's own size
                "relative shrink-0 text-foreground before:absolute before:-inset-x-1.5 before:-inset-y-2.5 before:content-['']",
              )}
            >
              {spot.showAll}
            </button>
          </p>
        ) : more && moreText ? (
          <p className={cn(FOLIO, "flex min-w-0 items-baseline justify-center")}>
            {kept > 0 && (
              <span aria-hidden className="truncate">
                <Parts parts={position.slice(-kept)} />
                {SEP}
              </span>
            )}
            <button
              type="button"
              data-more-refs=""
              aria-label={more.name}
              onClick={more.onTurn}
              className={cn(
                CREDIT_LINK,
                // 44px to hit (an invisible ring), the line's own size
                "relative shrink-0 whitespace-nowrap text-(--note-ink-text) before:absolute before:-inset-x-1.5 before:-inset-y-2.5 before:content-['']",
              )}
            >
              {/* "p. 2 →" where the whole line won't fit (large text) */}
              {fit.moreFull ? moreText : arrow(more.short)}
            </button>
          </p>
        ) : position.length > 0 && (
          <p
            aria-hidden
            // The folio is set in the reading face (Paper: serif, Clean: sans)
            className={cn(FOLIO, "truncate")}
          >
            <Parts parts={position.slice(-fit.position)} />
          </p>
        )}
        {!fit.creditWide && creditLine}
      </div>
      <FootEnd button={next} dir="next" />
      {fit.creditWide && creditLine}
      <SupportLine />
      {/* Ruler: every part at its natural width, for useFit */}
      <div ref={fit.rulerRef} aria-hidden className="invisible absolute top-0 left-0 h-0 overflow-hidden whitespace-nowrap">
        {[folio, measured].map((parts, row) => (
          <div key={row} className={row === 0 ? FOLIO : CREDIT}>
            <span>{SEP}</span>
            {parts.map((part, i) => (
              <span key={i}>{part}</span>
            ))}
          </div>
        ))}
        {spot && (
          <div className={FOLIO}>
            <span>{`${spot.label}${SEP}${spot.showAll}`}</span>
          </div>
        )}
      </div>
    </nav>
  );
}

const FOLIO = "font-serif text-control text-muted-foreground tabular-nums";
const CREDIT = "text-meta text-muted-foreground";
const SEP = "\u00a0· ";
const COFFEE_GLYPH = "☕\u00a0";
const SHARE_GLYPH = "↗\u00a0";

/** "☕ Buy me a coffee · ↗ Share": minor, non-intrusive links (API.Bible
 * non-commercial terms, lib/support.ts) — as quiet as the source link, on a
 * line of their own. They wrap as whole links (a narrow foot, large text):
 * then one under the other, and the "·" goes (#240) — never left dangling. */
export function SupportLine({ phone = false, className }: { phone?: boolean; className?: string }) {
  const { t } = useTranslation();
  const lineRef = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => {
    const line = lineRef.current;
    const first = line?.querySelector("a");
    const last = line?.querySelector("button");
    if (!line || !first || !last) return;
    // Measured side by side, separator shown, every time: hiding it can't
    // flip the answer back
    const fit = () => {
      delete line.dataset.stacked;
      if (last.offsetTop > first.offsetTop) line.dataset.stacked = "";
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(line);
    ro.observe(first);
    return () => ro.disconnect();
  }, []);
  // Touch: a full target (phones always; a tablet's paged foot too)
  // A mouse: 24px tall at least (WCAG 2.5.8, #196)
  const target = phone ? "inline-flex min-h-11 items-center px-2" : "inline-flex min-h-6 items-center pointer-coarse:min-h-11";
  return (
    <p ref={lineRef} className={cn(CREDIT, "group col-span-3 flex flex-wrap items-center justify-center gap-x-1 text-center data-stacked:flex-col", className)}>
      <a href={COFFEE_URL} target="_blank" rel="noopener noreferrer" className={cn(CREDIT_LINK, "whitespace-nowrap", target)}>
        {/* inline-block: the underline skips the glyph */}
        <span aria-hidden className="inline-block">
          {COFFEE_GLYPH}
        </span>
        {t("support.coffee")}
        <span className="sr-only"> {t("copyright.newTab")}</span>
      </a>
      <span aria-hidden className="group-data-stacked:hidden">
        ·
      </span>
      <ShareMenu name={t("share.friend")} className={cn(CREDIT_LINK, "cursor-pointer whitespace-nowrap", target)}>
        <span aria-hidden className="inline-block">
          {SHARE_GLYPH}
        </span>
        {t("share.short")}
      </ShareMenu>
    </p>
  );
}

/**
 * How the centre fits between the two buttons, measured on the ruler
 * (natural widths, so a line comes back as soon as there's room again):
 * the folio keeps the parts that fit there; the credit stays under it while
 * it fits whole, else takes the foot's full width on a line of its own.
 */
function useFit(position: string[], credit: string[], spot: string[], more: boolean) {
  const navRef = useRef<HTMLElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ position: position.length, credit: credit.length, creditWide: false, spotFull: true, moreFull: true });
  const key = JSON.stringify([position, credit, spot]);
  useLayoutEffect(() => {
    const nav = navRef.current;
    const ruler = rulerRef.current;
    if (!nav || !ruler) return;
    const measure = () => {
      const outer = (el: Element | undefined) => {
        if (!(el instanceof HTMLElement)) return 0;
        const style = getComputedStyle(el);
        return el.offsetWidth + parseFloat(style.marginLeft) + parseFloat(style.marginRight);
      };
      const ends = [...nav.querySelectorAll("[data-foot-end]")];
      const gap = parseFloat(getComputedStyle(nav).columnGap) || 0;
      const full = nav.clientWidth;
      const centre = full - 2 * Math.max(outer(ends[0]), outer(ends[1])) - 2 * gap;
      const [folio = [], credits = [], spotLine = []] = [...ruler.children].map((row) =>
        [...row.children].map((el) => el.getBoundingClientRect().width),
      );
      const creditWide = lineWidth(credits) > centre + 0.5;
      const room = creditWide ? full : centre;
      const next = {
        position: partsThatFit(folio, centre),
        credit: partsThatFit(credits, room),
        creditWide,
        spotFull: (spotLine[0] ?? 0) <= centre + 0.5,
        // The foot's "1 more on p. 2 →" rides last on the folio
        moreFull: !more || (folio.at(-1) ?? 0) <= centre + 0.5,
      };
      setFit((f) =>
        f.position === next.position &&
        f.credit === next.credit &&
        f.creditWide === next.creditWide &&
        f.spotFull === next.spotFull &&
        f.moreFull === next.moreFull
          ? f
          : next,
      );
    };
    measure();
    // Next frame: the fit changes the foot's height, which the observer
    // watches (no "ResizeObserver loop" warning)
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    });
    observer.observe(nav);
    nav.querySelectorAll("[data-foot-end]").forEach((el) => observer.observe(el));
    // Webfonts change every width once they arrive
    void document.fonts?.ready.then(measure);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [key, more]);
  return { navRef, rulerRef, ...fit };
}

/** The credit line's parts: the translation's own (one link to its
 * copyright entry), then the source, always (its own outside link). */
export function CreditParts({
  parts,
  link,
  source,
  ownLine = false,
}: {
  /** Phones: the source on a line of its own, a target apart from the
   * credit (a mis-tap there leaves the app). */
  ownLine?: boolean;
  parts: string[];
  link?: { href: string; more: string; from?: string };
  source?: { label: string; href: string; more: string };
}) {
  // Parts kept whole, except the last (a long copyright wraps inside
  // itself) — inline, so the source stays glued to its last word
  const own = parts.map((part, i) => (
    <Fragment key={i}>
      {i > 0 && SEP}
      <span className={i < parts.length - 1 ? "inline-block max-w-full" : undefined}>{part}</span>
    </Fragment>
  ));
  return (
    <>
      {parts.length > 0 &&
        (link ? (
          <Link to={link.href} state={link.from ? { from: link.from } : undefined} className={CREDIT_LINK}>
            {/* What it leads to first, then the notice (a links list reads the start) */}
            <span className="sr-only">{link.more}: </span>
            {own}
          </Link>
        ) : (
          own
        ))}
      {source && (
        <>
          {parts.length > 0 && !ownLine && "\u00a0·\u00a0"}
          <a
            href={source.href}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(CREDIT_LINK, "whitespace-nowrap", ownLine && "mt-2 block w-fit py-1")}
          >
            {source.label}
            <span className="sr-only"> {source.more}</span>
          </a>
        </>
      )}
    </>
  );
}

/** Quiet as the line it sits in: underlined on hover with a mouse; on
 * touch (no hover to find it) a faint underline always shows it's a link. */
const CREDIT_LINK = cn(
  "rounded-sm box-decoration-clone underline-offset-2 hover:text-foreground hover:underline pointer-coarse:underline pointer-coarse:decoration-muted-foreground/40",
  focusRing,
);

/** "a · b": each part kept whole when the line wraps (after a dot); a
 * part longer than the line (`wrapLong`) wraps inside itself instead. */
function Parts({ parts, wrapLong = false }: { parts: string[]; wrapLong?: boolean }) {
  return parts.map((part, i) => (
    <Fragment key={i}>
      {i > 0 && SEP}
      <span className={wrapLong ? "inline-block max-w-full" : "whitespace-nowrap"}>{part}</span>
    </Fragment>
  ));
}

/** One end of the phone's chapter bar (#242): "‹ Kapitel 2". */
export type BarButton = {
  /** The chapter it goes to; null: none (Genesis 1, Revelation 22). */
  chapter: number | null;
  /** Accessible name, starting with the visible words ("Kapitel 1, næste
   * kapitel: Apostlenes Gerninger 1"): the book is only said, never shown. */
  name: string;
  /** Tooltip ("Næste kapitel: Apostlenes Gerninger 1"). */
  tip: string;
  hintKey: string;
  keys: string;
  disabled: boolean;
  onClick: () => void;
};

/**
 * Phones (scroll mode, #238, #242): Previous / Next chapter leave the text
 * for a bar of their own at the bottom of the screen, like an app's tab bar —
 * always in reach while reading, never scrolling or sliding with the text
 * (it sits below the scroll pane, outside the chapter sheet). Three equal
 * thirds, each wholly a button, thumb-sized: "‹ Kapitel 2", "Søg" (the
 * omnisearch, as the header's Søg), "Kapitel 4 ›". No book names — the
 * header says the book; a crossing into another book says it in the
 * accessible name and tooltip only. Where "Kapitel" won't fit beside the
 * number (320px, large text) the word goes, the number stays. Out of the
 * way while a note's drawer is open (its peek and bar take the bottom of
 * the screen): unseen and inert, yet still holding its room, so the text
 * doesn't jump.
 */
export function ChapterBar({
  label,
  prev,
  next,
  hidden,
}: {
  /** Landmark name. */
  label: string;
  prev: BarButton;
  next: BarButton;
  hidden: boolean;
}) {
  const { t } = useTranslation();
  const barRef = useCrampedWords(`${prev.chapter}/${next.chapter}`);
  return (
    <nav
      ref={barRef}
      aria-label={label}
      data-chapter-bar=""
      inert={hidden}
      className={cn(
        // px, not rem: large text keeps the bar's room for the words
        "group grid shrink-0 grid-cols-3 gap-[4px] border-t border-border bg-background px-[4px] pt-[4px] pb-[max(env(safe-area-inset-bottom),4px)] font-sans",
        hidden && "invisible",
      )}
    >
      <BarEnd button={prev} dir="prev" />
      <Hint label={t("palette.open")} side="top">
        <Button
          variant="ghost"
          data-bar-search=""
          aria-haspopup="dialog"
          onPointerDown={palette.preload}
          onFocus={palette.preload}
          // The shared way in (#243): same search screen as the header's Søg
          onClick={(e) => openPaletteFromTap(e.currentTarget)}
          className={cn(BAR_BUTTON, "justify-center")}
        >
          <Search aria-hidden />
          <span className="min-w-0 truncate">{t("reader.barSearch")}</span>
        </Button>
      </Hint>
      <BarEnd button={next} dir="next" />
    </nav>
  );
}

/** A third of the bar, all of it the target: 52px tall (px: large text
 * keeps the bar one row), the wash fills it. */
const BAR_BUTTON = cn(
  "h-auto min-h-[52px] w-full min-w-0 gap-[2px] px-[4px] py-0 text-control text-foreground",
  "aria-disabled:pointer-events-none aria-disabled:opacity-40",
  focusRing,
);

function BarEnd({ button, dir }: { button: BarButton; dir: "prev" | "next" }) {
  const { t } = useTranslation();
  const live = useLiveShortcut();
  const Icon = dir === "prev" ? ChevronLeft : ChevronRight;
  return (
    <Hint label={button.tip} shortcut={button.hintKey} side="top">
      <Button
        variant="ghost"
        // Still focusable when disabled: nothing shifts, focus stays put
        disabled={button.disabled}
        focusableWhenDisabled
        data-bar-end={dir}
        // A spotlight lasts over a chapter step, as on the paged foot
        data-foot-end
        aria-label={button.name}
        aria-keyshortcuts={live(button.keys) || undefined}
        onClick={button.onClick}
        className={cn(BAR_BUTTON, dir === "prev" ? "justify-start" : "justify-end")}
      >
        {dir === "prev" && <Icon aria-hidden />}
        {/* Nothing that way (Genesis 1, Revelation 22): the faint chevron */}
        {button.chapter !== null && (
          <span className="flex min-w-0 whitespace-nowrap">
            <span data-chapter-word="" className="min-w-0 overflow-hidden group-data-cramped:hidden">
              {t("reader.barChapter")}
              {"\u00a0"}
            </span>
            <span data-chapter-num="" className="shrink-0 tabular-nums">
              {button.chapter}
            </span>
          </span>
        )}
        {dir === "next" && <Icon aria-hidden />}
      </Button>
    </Hint>
  );
}

/** "Kapitel" where it fits whole beside the number in both ends, else
 * it goes from both (the accessible names still say it): "‹ 20 · 21 ›",
 * never "‹ 20 · Kapitel 1 ›". Measured shown, every time, so hiding it
 * can't flip the answer back; a text-size change leaves the thirds as wide,
 * so the numbers are watched too. */
function useCrampedWords(key: string) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const bar = ref.current;
    if (!bar) return;
    const fit = () => {
      delete bar.dataset.cramped;
      const words = [...bar.querySelectorAll<HTMLElement>("[data-chapter-word]")];
      if (words.some((w) => w.scrollWidth > w.clientWidth + 0.5)) bar.dataset.cramped = "";
    };
    fit();
    // Now and again once the frame has settled (a resize and a text-size
    // change can land in one frame)
    let frame = 0;
    const ro = new ResizeObserver(() => {
      fit();
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    });
    ro.observe(bar);
    bar.querySelectorAll("[data-chapter-num]").forEach((el) => ro.observe(el));
    void document.fonts?.ready.then(fit);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [key]);
  return ref;
}

function FootEnd({ button, dir }: { button: FootButton; dir: "prev" | "next" }) {
  const Icon = dir === "prev" ? ChevronLeft : ChevronRight;
  // Mouse turns on press, like a page under the finger; touch keeps click
  // (a press may be a scroll), keyboard keeps Enter/Space (detail 0)
  const pressed = useRef(false);
  const live = useLiveShortcut();
  return (
    <Hint label={button.name} shortcut={button.hintKey} side="top">
      <Button
        variant="ghost"
        // Still focusable when disabled: a page turn that reaches the end
        // doesn't throw keyboard focus back to the page
        disabled={button.disabled}
        focusableWhenDisabled
        data-foot-end
        aria-label={button.name === button.label ? undefined : button.name}
        aria-keyshortcuts={live(button.keys) || undefined}
        onPointerDown={(e) => {
          pressed.current = e.pointerType === "mouse" && e.button === 0 && !button.disabled;
          if (pressed.current) button.onClick();
        }}
        onClick={(e) => {
          if (e.detail > 0 && pressed.current) {
            pressed.current = false;
            return;
          }
          button.onClick();
        }}
        className={cn(
          // -mx-2: chevron and word line up with the text's edge; the hover
          // wash spills into the content padding, never into a margin lane
          "gap-1 px-2 text-control text-foreground has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5",
          "h-9 min-w-0 max-w-[45cqw]",
          dir === "prev" ? "-ml-2 justify-self-start" : "-mr-2 justify-self-end",
          "aria-disabled:pointer-events-none aria-disabled:opacity-40",
          focusRing,
        )}
      >
        {dir === "prev" && <Icon aria-hidden data-icon="inline-start" />}
        {button.place ? (
          <span className="flex min-w-0">
            <span className="min-w-0 truncate">
              {button.place.book}
              {"\u00a0"}
            </span>
            <span data-chapter-num="" className="shrink-0 tabular-nums">
              {button.place.chapter}
            </span>
          </span>
        ) : (
          button.label
        )}
        {dir === "next" && <Icon aria-hidden data-icon="inline-end" />}
      </Button>
    </Hint>
  );
}
