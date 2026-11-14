import { Fragment } from "react";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { Hint } from "~/components/hint";
import { Button } from "~/components/ui/button";
import { cn, focusRing } from "~/lib/utils";

/** One end of the bar. `label` is what it says; `name` its full accessible
 * name (starts with/contains the visible words). */
export type BarButton = {
  label: string;
  name: string;
  /** Tooltip key ("←") + aria-keyshortcuts ("ArrowLeft PageUp"). */
  hintKey: string;
  keys: string;
  /** Nothing that way (Genesis 1's first page, Revelation 22's last). */
  disabled: boolean;
  /** Crossing into the next chapter at the end of this one: the bar's one
   * filled button, with an arrow instead of a chevron. */
  primary?: boolean;
  onClick: () => void;
};

/**
 * Page bar: the reader's one page-turn control, pinned under the
 * reading pane at the width of the text — "‹ Previous" · "John 3:11–21 ·
 * Page 2 of 4" (+ credit) · "Next ›". At a chapter boundary a button names
 * where it goes; the last page's Next becomes "Continue to John 4 →".
 * Buttons keep a minimum width and stay mounted (disabled, still focusable)
 * so nothing shifts and focus stays put while turning pages with Enter.
 * Phones (scroll mode) get the same bar stepping chapters, larger targets.
 */
export function PageBar({
  label,
  position,
  credit,
  prev,
  next,
  phone,
  maxWidth,
}: {
  /** Landmark name: "Pages" / "Chapters". */
  label: string;
  /** Centre line (paged: visual only, the live region announces turns): parts
   * joined by " · ", each kept whole when the line wraps. */
  position: string[];
  credit?: string;
  prev: BarButton;
  next: BarButton;
  phone: boolean;
  /** rem: the text column's width (desktop). */
  maxWidth?: number;
}) {
  return (
    <nav
      aria-label={label}
      className="shrink-0 border-t border-border px-4 py-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] sm:px-6"
    >
      <div
        // Equal side tracks keep the centre centred. Desktop sides never go
        // below their button's full label; phones let the label truncate
        className={cn(
          "mx-auto grid w-full items-center gap-3",
          phone
            ? "grid-cols-[1fr_minmax(0,auto)_1fr]"
            : "grid-cols-[minmax(max-content,1fr)_minmax(0,auto)_minmax(max-content,1fr)]",
        )}
        style={maxWidth ? { maxWidth: `${maxWidth}rem` } : undefined}
      >
        <BarEnd button={prev} dir="prev" phone={phone} />
        <div className="min-w-0 text-center">
          <p aria-hidden={!phone} className="text-control text-foreground tabular-nums text-balance">
            {position.map((part, i) => (
              <Fragment key={i}>
                {i > 0 && " · "}
                <span className={cn(!phone && "whitespace-nowrap")}>{part}</span>
              </Fragment>
            ))}
          </p>
          {credit && <p className="mt-0.5 text-meta text-muted-foreground text-balance">{credit}</p>}
        </div>
        <BarEnd button={next} dir="next" phone={phone} />
      </div>
    </nav>
  );
}

function BarEnd({ button, dir, phone }: { button: BarButton; dir: "prev" | "next"; phone: boolean }) {
  const Icon = button.primary ? ArrowRight : dir === "prev" ? ChevronLeft : ChevronRight;
  return (
    <Hint label={button.name} shortcut={button.hintKey} side="top">
      <Button
        variant={button.primary ? "default" : "outline"}
        // Still focusable when disabled: a page turn that reaches the end
        // doesn't throw keyboard focus back to the page
        disabled={button.disabled}
        focusableWhenDisabled
        aria-label={button.name === button.label ? undefined : button.name}
        aria-keyshortcuts={button.keys}
        onClick={button.onClick}
        className={cn(
          "min-w-28 gap-1.5 px-3 text-control",
          phone ? "min-h-12 max-w-full" : "min-h-11",
          dir === "prev" ? "justify-self-start" : "justify-self-end",
          !button.primary &&
            // /55: ≥3:1 against the page in every reader style
            "border-foreground/55 text-foreground dark:border-foreground/55 dark:bg-background dark:hover:bg-muted",
          "aria-disabled:pointer-events-none aria-disabled:opacity-50",
          focusRing,
        )}
      >
        {dir === "prev" && <Icon aria-hidden data-icon="inline-start" />}
        {/* Desktop labels never clip (the centre wraps instead); phones
            truncate a long book name rather than crowd out the centre */}
        <span className={cn(phone && "min-w-0 truncate")}>{button.label}</span>
        {dir === "next" && <Icon aria-hidden data-icon="inline-end" />}
      </Button>
    </Hint>
  );
}
