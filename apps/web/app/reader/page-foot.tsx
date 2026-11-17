import { Fragment, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Hint } from "~/components/hint";
import { Button } from "~/components/ui/button";
import { useLiveShortcut } from "~/lib/shortcuts";
import { COFFEE_URL } from "~/lib/support";
import { cn, focusRing } from "~/lib/utils";
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
 * line of their own. They wrap as whole links (a narrow foot, large text). */
export function SupportLine({ phone = false, className }: { phone?: boolean; className?: string }) {
  const { t } = useTranslation();
  // Touch: a full target (phones always; a tablet's paged foot too)
  // A mouse: 24px tall at least (WCAG 2.5.8, #196)
  const target = phone ? "inline-flex min-h-11 items-center px-2" : "inline-flex min-h-6 items-center pointer-coarse:min-h-11";
  return (
    <p className={cn(CREDIT, "col-span-3 flex flex-wrap items-center justify-center gap-x-1 text-center", className)}>
      <a href={COFFEE_URL} target="_blank" rel="noopener noreferrer" className={cn(CREDIT_LINK, "whitespace-nowrap", target)}>
        {/* inline-block: the underline skips the glyph */}
        <span aria-hidden className="inline-block">
          {COFFEE_GLYPH}
        </span>
        {t("support.coffee")}
        <span className="sr-only"> {t("copyright.newTab")}</span>
      </a>
      <span aria-hidden>·</span>
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

/**
 * Phones (scroll mode, #238): Previous / Next chapter leave the text for a
 * bar of their own at the bottom of the screen, like an app's tab bar —
 * always in reach while reading, never scrolling or sliding with the text
 * (it sits below the scroll pane, outside the chapter sheet). Each button
 * takes up to half the bar; a long book name gives way with an ellipsis,
 * the chapter number never does. Out of the way while a note's drawer is
 * open (its peek and bar take the bottom of the screen): unseen and inert,
 * yet still holding its room, so the text doesn't jump.
 */
export function ChapterBar({
  label,
  prev,
  next,
  hidden,
}: {
  /** Landmark name. */
  label: string;
  prev: FootButton;
  next: FootButton;
  hidden: boolean;
}) {
  return (
    <nav
      aria-label={label}
      data-chapter-bar=""
      inert={hidden}
      className={cn(
        "flex shrink-0 items-center justify-between gap-2 border-t border-border bg-background px-2 pt-0.5 pb-[max(env(safe-area-inset-bottom),2px)] font-sans",
        hidden && "invisible",
      )}
    >
      <FootEnd button={prev} dir="prev" bar />
      <FootEnd button={next} dir="next" bar />
    </nav>
  );
}

function FootEnd({ button, dir, bar = false }: { button: FootButton; dir: "prev" | "next"; bar?: boolean }) {
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
          // The bar: half of it at most, the name cut short inside
          // 44px (not 2.75rem): large text keeps the bar one slim row
          bar ? "h-auto min-h-[44px] min-w-0 max-w-[calc(50%-0.25rem)] py-1" : "h-9 min-w-0 max-w-[45cqw]",
          !bar && (dir === "prev" ? "-ml-2 justify-self-start" : "-mr-2 justify-self-end"),
          "aria-disabled:pointer-events-none aria-disabled:opacity-40",
          focusRing,
        )}
      >
        {dir === "prev" && <Icon aria-hidden data-icon="inline-start" />}
        {button.place ? (
          <span className="flex min-w-0">
            <span className="min-w-0 truncate">{button.place.book}</span>
            <span data-chapter-num="" className="shrink-0 tabular-nums">
              {"\u00a0"}
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
