import { Fragment } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Hint } from "~/components/hint";
import { Button } from "~/components/ui/button";
import { cn, focusRing } from "~/lib/utils";

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
  return (
    <nav
      aria-label={label}
      // Equal side tracks keep the folio centred under the text
      className={cn(
        "grid w-full grid-cols-[minmax(max-content,1fr)_minmax(0,auto)_minmax(max-content,1fr)] items-center gap-2 font-sans",
        className,
      )}
    >
      <FootEnd button={prev} dir="prev" phone={phone} />
      <div className="min-w-0 text-center">
        {position.length > 0 && (
          <p
            aria-hidden={!phone}
            // The folio is set in the reading face (Paper: serif, Clean: sans)
            className="font-serif text-control text-muted-foreground tabular-nums text-balance"
          >
            <Parts parts={position} />
          </p>
        )}
        {credit && credit.length > 0 && (
          <p className="text-meta text-muted-foreground text-balance">
            <Parts parts={credit} />
          </p>
        )}
      </div>
      <FootEnd button={next} dir="next" phone={phone} />
    </nav>
  );
}

/** "a · b": each part kept whole when the line wraps (after a dot). */
function Parts({ parts }: { parts: string[] }) {
  return parts.map((part, i) => (
    <Fragment key={i}>
      {i > 0 && "\u00a0· "}
      <span className="whitespace-nowrap">{part}</span>
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
