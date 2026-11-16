import { Fragment, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Hint } from "~/components/hint";
import { Button } from "~/components/ui/button";
import { useLiveShortcut } from "~/lib/shortcuts";
import { COFFEE_URL } from "~/lib/support";
import { cn, focusRing } from "~/lib/utils";
import { coffeeFits, lineWidth, partsThatFit } from "./sheet-layout";
import { turnStill } from "./turn-still";

/** One end of the foot. `label` is what it says; `name` its full accessible
 * name (starts with/contains the visible words). */
export type FootButton = {
  label: string;
  name: string;
  /** Tooltip key ("←") + aria-keyshortcuts ("ArrowLeft PageUp"). */
  hintKey: string;
  keys: string;
  /** Nothing that way (Genesis 1's first page, Revelation 22's last). */
  disabled: boolean;
  onClick: () => void;
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
 * Phones (scroll mode) end the chapter with the same foot, stepping
 * chapters with larger targets. Paged, it is chrome: it stays put while the
 * page turns (turn-still.ts); a phone's foot ends the text and scrolls with it.
 * Narrow (large text, a narrow window): the buttons keep their words and
 * the centre gives way, never over them — each line keeps its last part
 * (the page count, the copyright) and drops the parts before it that no
 * longer fit beside it (the verse range under the verses themselves, the
 * translation name in the header). The folio stays one line (truncated as
 * a last resort); a long copyright wraps, it is never cut.
 * "☕ Buy me a coffee" (lib/support.ts) closes the credit line, after the
 * source: a quiet link in spare room only. It shows only where the credit
 * line keeps every part and takes no more lines with it than without, so
 * the foot never grows (no text lost per page) and the credit and source
 * are never pushed out or cut — it is the first thing to go. Phones (no credit line; the room is free at the chapter's
 * end): its own centred line under the buttons, a full touch target.
 */
export function PageFoot({
  label,
  position,
  credit,
  creditLink,
  source,
  prev,
  next,
  phone,
  className,
}: {
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
  phone: boolean;
  className?: string;
}) {
  const credits = credit ?? [];
  // The source rides on the last part (measured with it): never dropped
  const measured = source && credits.length > 0 ? [...credits.slice(0, -1), `${credits.at(-1)}\u00a0·\u00a0${source.label}`] : credits;
  const { t } = useTranslation();
  const coffeeLabel = t("support.coffee");
  const fit = useFit(position, measured, coffeeLabel);
  const creditLine = credits.length > 0 && (
    // Own line: as wide as the foot, never widening the folio's track
    <p className={cn(CREDIT, "text-balance", fit.creditWide && "col-span-3 w-0 min-w-full text-center")}>
      <CreditParts parts={credits.slice(-fit.credit)} link={creditLink} source={source} />
      {fit.coffee && (
        <>
          {SEP}
          <Coffee label={coffeeLabel} />
        </>
      )}
    </p>
  );
  return (
    <nav
      ref={fit.navRef}
      {...(phone ? {} : turnStill("foot"))}
      aria-label={label}
      // Equal side tracks keep the folio centred under the text
      className={cn(
        "relative grid w-full grid-cols-[minmax(max-content,1fr)_minmax(0,auto)_minmax(max-content,1fr)] items-center gap-x-2 font-sans",
        className,
      )}
    >
      <FootEnd button={prev} dir="prev" phone={phone} />
      <div className="min-w-0 text-center">
        {position.length > 0 && (
          <p
            aria-hidden={!phone}
            // The folio is set in the reading face (Paper: serif, Clean: sans)
            className={cn(FOLIO, "truncate")}
          >
            <Parts parts={position.slice(-fit.position)} />
          </p>
        )}
        {!fit.creditWide && creditLine}
      </div>
      <FootEnd button={next} dir="next" phone={phone} />
      {fit.creditWide && creditLine}
      {phone && (
        <p className={cn(CREDIT, "col-span-3 mt-2 text-center")}>
          <Coffee label={coffeeLabel} className="inline-flex min-h-11 items-center px-2" />
        </p>
      )}
      {/* Ruler: every part at its natural width, for useFit */}
      <div ref={fit.rulerRef} aria-hidden className="invisible absolute top-0 left-0 h-0 overflow-hidden whitespace-nowrap">
        {[position, measured].map((parts, row) => (
          <div key={row} className={row === 0 ? FOLIO : CREDIT}>
            <span>{SEP}</span>
            {parts.map((part, i) => (
              <span key={i}>{part}</span>
            ))}
          </div>
        ))}
        {!phone && (
          <div className={CREDIT}>
            <span>{COFFEE_GLYPH}</span>
            <span>{coffeeLabel}</span>
          </div>
        )}
      </div>
      {/* Wrap ruler: the credit's own line as set (useFit sets its width),
          without and with the coffee — does it cost a line? */}
      {!phone && credits.length > 0 && (
        <div ref={fit.wrapRef} aria-hidden className="invisible absolute top-0 left-0 h-0 overflow-hidden">
          {[false, true].map((withCoffee) => (
            <p key={String(withCoffee)} className={cn(CREDIT, "text-center text-balance")}>
              {/* As CreditParts sets it */}
              {credits.map((part, i) => (
                <Fragment key={i}>
                  {i > 0 && SEP}
                  <span className={i < credits.length - 1 ? "inline-block max-w-full" : undefined}>{part}</span>
                </Fragment>
              ))}
              {source && (
                <>
                  {"\u00a0·\u00a0"}
                  <span className="whitespace-nowrap">{source.label}</span>
                </>
              )}
              {withCoffee && (
                <>
                  {SEP}
                  <span className="whitespace-nowrap">
                    {COFFEE_GLYPH}
                    {coffeeLabel}
                  </span>
                </>
              )}
            </p>
          ))}
        </div>
      )}
    </nav>
  );
}

const FOLIO = "font-serif text-control text-muted-foreground tabular-nums";
const CREDIT = "text-meta text-muted-foreground";
const SEP = "\u00a0· ";
const COFFEE_GLYPH = "☕\u00a0";

/** "☕ Buy me a coffee": a minor, non-intrusive donation link (API.Bible
 * non-commercial terms, lib/support.ts) — as quiet as the source link. */
function Coffee({ label, className }: { label: string; className?: string }) {
  const { t } = useTranslation();
  return (
    <a href={COFFEE_URL} target="_blank" rel="noopener noreferrer" className={cn(CREDIT_LINK, "whitespace-nowrap", className)}>
      {/* inline-block: the underline skips the cup */}
      <span aria-hidden className="inline-block">
        {COFFEE_GLYPH}
      </span>
      {label}
      <span className="sr-only"> {t("copyright.newTab")}</span>
    </a>
  );
}

/**
 * How the centre fits between the two buttons, measured on the ruler
 * (natural widths, so a line comes back as soon as there's room again):
 * the folio keeps the parts that fit there; the credit stays under it while
 * it fits whole, else takes the foot's full width on a line of its own.
 * The coffee link joins that line only while every credit part is kept and
 * the line, with it, still fits there whole (coffeeFits).
 */
function useFit(position: string[], credit: string[], coffee: string) {
  const navRef = useRef<HTMLElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ position: position.length, credit: credit.length, creditWide: false, coffee: false });
  const key = JSON.stringify([position, credit, coffee]);
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
      const [folio = [], credits = [], cup = []] = [...ruler.children].map((row) =>
        [...row.children].map((el) => el.getBoundingClientRect().width),
      );
      const creditWide = lineWidth(credits) > centre + 0.5;
      const room = creditWide ? full : centre;
      const credit = partsThatFit(credits, room);
      // Own line (it may wrap): the coffee rides on its last line's spare
      // room — the same wrapped line, with and without it, as tall
      const wrap = wrapRef.current;
      let wrapsAlike = false;
      if (creditWide && wrap) {
        wrap.style.width = `${full}px`;
        const [alone, joined] = [...wrap.children].map((el) => el.getBoundingClientRect().height);
        wrapsAlike = !!alone && joined! <= alone + 0.5;
      }
      const next = {
        position: partsThatFit(folio, centre),
        credit,
        creditWide,
        coffee:
          cup.length > 0 &&
          credit === credits.length - 1 &&
          (creditWide ? wrapsAlike : coffeeFits(credits, cup.reduce((sum, w) => sum + w, 0), room)),
      };
      setFit((f) =>
        f.position === next.position && f.credit === next.credit && f.creditWide === next.creditWide && f.coffee === next.coffee
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
  }, [key]);
  return { navRef, rulerRef, wrapRef, ...fit };
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

function FootEnd({ button, dir, phone }: { button: FootButton; dir: "prev" | "next"; phone: boolean }) {
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
        aria-keyshortcuts={live(button.keys)}
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
          phone ? "min-h-11" : "h-9",
          dir === "prev" ? "-ml-2 justify-self-start" : "-mr-2 justify-self-end",
          "aria-disabled:pointer-events-none aria-disabled:opacity-40",
          focusRing,
        )}
      >
        {dir === "prev" && <Icon aria-hidden data-icon="inline-start" />}
        {button.label}
        {dir === "next" && <Icon aria-hidden data-icon="inline-end" />}
      </Button>
    </Hint>
  );
}
