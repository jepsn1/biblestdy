import { Fragment, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Hint } from "~/components/hint";
import { Button } from "~/components/ui/button";
import { cn, focusRing } from "~/lib/utils";
import { lineWidth, partsThatFit } from "./sheet-layout";

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
 * chapters with larger targets.
 * Narrow (large text, a narrow window): the buttons keep their words and
 * the centre gives way, never over them — each line keeps its last part
 * (the page count, the copyright) and drops the parts before it that no
 * longer fit beside it (the verse range under the verses themselves, the
 * translation name in the header). The folio stays one line (truncated as
 * a last resort); a long copyright wraps, it is never cut.
 */
export function PageFoot({
  label,
  position,
  credit,
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
  prev: FootButton;
  next: FootButton;
  phone: boolean;
  className?: string;
}) {
  const credits = credit ?? [];
  const fit = useFit(position, credits);
  const creditLine = credits.length > 0 && (
    // Own line: as wide as the foot, never widening the folio's track
    <p className={cn(CREDIT, "text-balance", fit.creditWide && "col-span-3 w-0 min-w-full text-center")}>
      <Parts parts={credits.slice(-fit.credit)} wrapLong />
    </p>
  );
  return (
    <nav
      ref={fit.navRef}
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
      {/* Ruler: every part at its natural width, for useFit */}
      <div ref={fit.rulerRef} aria-hidden className="invisible absolute top-0 left-0 h-0 overflow-hidden whitespace-nowrap">
        {[position, credits].map((parts, row) => (
          <div key={row} className={row === 0 ? FOLIO : CREDIT}>
            <span>{SEP}</span>
            {parts.map((part, i) => (
              <span key={i}>{part}</span>
            ))}
          </div>
        ))}
      </div>
    </nav>
  );
}

const FOLIO = "font-serif text-control text-muted-foreground tabular-nums";
const CREDIT = "text-meta text-muted-foreground";
const SEP = "\u00a0· ";

/**
 * How the centre fits between the two buttons, measured on the ruler
 * (natural widths, so a line comes back as soon as there's room again):
 * the folio keeps the parts that fit there; the credit stays under it while
 * it fits whole, else takes the foot's full width on a line of its own.
 */
function useFit(position: string[], credit: string[]) {
  const navRef = useRef<HTMLElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ position: position.length, credit: credit.length, creditWide: false });
  const key = JSON.stringify([position, credit]);
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
      const [folio = [], credits = []] = [...ruler.children].map((row) =>
        [...row.children].map((el) => el.getBoundingClientRect().width),
      );
      const creditWide = lineWidth(credits) > centre + 0.5;
      const next = {
        position: partsThatFit(folio, centre),
        credit: partsThatFit(credits, creditWide ? full : centre),
        creditWide,
      };
      setFit((f) =>
        f.position === next.position && f.credit === next.credit && f.creditWide === next.creditWide ? f : next,
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
  return { navRef, rulerRef, ...fit };
}

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
        aria-keyshortcuts={button.keys}
        onClick={button.onClick}
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
