import type * as React from "react";
import { X } from "lucide-react";
import { Hint } from "~/components/hint";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

/**
 * One header for every side panel and drawer (#62): note, connections,
 * settings — desktop and phone alike. Title area left (an h2, or the note's
 * title input), a visible 32px × right, hairline below. The × is always
 * there: a swipe handle alone is a hidden gesture.
 */
export function PanelHeader({
  children,
  onClose,
  closeLabel,
  className,
}: {
  children: React.ReactNode;
  onClose: () => void;
  closeLabel: string;
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
      <Hint label={closeLabel} shortcut="Esc">
        <Button
          variant="ghost"
          size="icon"
          aria-label={closeLabel}
          onClick={onClose}
          className="text-muted-foreground"
        >
          <X />
        </Button>
      </Hint>
    </header>
  );
}

/** The panel title style shared by every PanelHeader. */
export const panelTitleClass = "truncate font-serif text-lg font-medium";
