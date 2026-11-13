import type * as React from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";

/** "⌘" on Apple keyboards, "Ctrl+" elsewhere — read at open time (client). */
export function modKey(): string {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)
    ? "⌘"
    : "Ctrl+";
}

/**
 * Tooltip for an icon button (#62): names the control and, when it has one,
 * its keyboard shortcut. Mouse/keyboard focus only — touch never opens it,
 * so phones rely on labels (the "More" sheet). Delay comes from root's
 * TooltipProvider (~300ms). The child keeps its own aria-label.
 */
export function Hint({
  label,
  shortcut,
  side = "bottom",
  children,
}: {
  label: string;
  shortcut?: string;
  side?: "top" | "bottom" | "left" | "right";
  children: React.ReactElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side={side}>
        {label}
        {shortcut && (
          <kbd
            data-slot="kbd"
            className="rounded-sm bg-background/20 px-1 font-mono text-[0.7rem] leading-4"
          >
            {shortcut}
          </kbd>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
