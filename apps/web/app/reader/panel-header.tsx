import type * as React from "react";
import { X } from "lucide-react";
import { Hint } from "~/components/hint";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

/**
 * One header for every side panel and drawer (#62): note, connections,
 * settings — desktop and phone alike. Title area left (an h2, or the note's
 * title input), a visible 32px × right, hairline below. The × is always
 * there: a swipe handle alone is a hidden gesture. `closeAs` renders it as
 * the surface's own Close part (a focus-trapping popover needs one).
 */
export function PanelHeader({
  children,
  onClose,
  closeLabel,
  closeAs = (button) => button,
  closeText,
  actions,
  className,
}: {
  children: React.ReactNode;
  onClose: () => void;
  closeLabel: string;
  closeAs?: (button: React.ReactElement) => React.ReactElement;
  /** A visible word beside the × (#261 panel: the note's Close reads
   * "Luk" — a lone grey × was mistaken for nothing, the footer's Delete for
   * Close). The accessible name stays `closeLabel` ("Luk note"). */
  closeText?: string;
  /** Controls left of Close (the note's "Mere" menu). */
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex min-h-12 shrink-0 items-center gap-2 border-b border-border py-1.5 pr-2 pl-4",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-center">{children}</div>
      {actions}
      <Hint label={closeLabel} shortcut="Esc">
        {closeAs(
          closeText ? (
            <Button
              variant="ghost"
              aria-label={closeLabel}
              onClick={onClose}
              className="h-11 shrink-0 gap-1 px-2.5 font-medium text-foreground md:h-9"
            >
              <X aria-hidden className="size-[1.125rem]" />
              {closeText}
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              aria-label={closeLabel}
              onClick={onClose}
              className="text-muted-foreground"
            >
              <X />
            </Button>
          ),
        )}
      </Hint>
    </header>
  );
}

/** The panel title style shared by every PanelHeader. */
export const panelTitleClass = "truncate font-serif text-title font-medium";
