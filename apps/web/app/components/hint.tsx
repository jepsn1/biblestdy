import type * as React from "react";
import { useLiveShortcut } from "~/lib/shortcuts";
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
 * `shortcut` may say "mod+B": shown as ⌘B or Ctrl+B (resolved on open, so
 * SSR markup never depends on the platform). A single-key shortcut is left
 * out while those are off (#145).
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
  const live = useLiveShortcut()(shortcut);
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side={side}>
        {label}
        {live && (
          <kbd
            data-slot="kbd"
            className="rounded-sm bg-background/20 px-1 font-mono text-meta leading-4"
          >
            {live.replace("mod+", modKey())}
          </kbd>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
