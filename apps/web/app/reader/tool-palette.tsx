import type { HighlightColor } from "@biblestdy/shared";
import { HIGHLIGHT_COLORS } from "@biblestdy/shared";
import { Eraser, FileText, Highlighter, MousePointer2, PenLine, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Hint } from "~/components/hint";
import { cn, focusRing } from "~/lib/utils";
import { HIGHLIGHT_SWATCH } from "./highlight-colors";

/**
 * Tool-first study (desktop): the reader's two ways to mark the text, used
 * whichever suits the moment —
 * - Select (default): select words, then pick an action from the menu.
 * - A tool: pick it here, then every selection (drag, or a click on one
 *   word) gets it straight away — highlight in the tool's colour, annotate,
 *   start a note, or erase highlights/annotations.
 * Lives in the left page-turn gutter, mouse/trackpad only (touch swipes
 * and selects with the menu); never persisted (a reload is back to
 * Select, so nobody is surprised by a mode they forgot).
 */

export type ToolKind = "select" | "highlight" | "annotate" | "note" | "erase";
export type ReaderTool = { kind: ToolKind; color: HighlightColor };

/** Palette size + top offset; the right page-turn strip reserves the same,
 * so both page arrows sit at one height. */
export const PALETTE_BOX = "mt-3 h-48.5 shrink-0";

const TOOLS: { kind: ToolKind; icon: LucideIcon }[] = [
  { kind: "select", icon: MousePointer2 },
  { kind: "highlight", icon: Highlighter },
  { kind: "annotate", icon: PenLine },
  { kind: "note", icon: FileText },
  { kind: "erase", icon: Eraser },
];

export function ToolPalette({
  tool,
  onChange,
}: {
  tool: ReaderTool;
  onChange: (tool: ReaderTool) => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="toolbar"
      aria-orientation="vertical"
      aria-label={t("tools.label")}
      className={cn(PALETTE_BOX, "mx-auto flex pointer-coarse:hidden w-10 flex-col items-center gap-0.5 rounded-xl border border-border bg-background p-0.5 shadow-xs")}
    >
      {TOOLS.map(({ kind, icon: Icon }) => {
        const on = tool.kind === kind;
        return (
          <div key={kind} className="relative">
            <Hint label={`${t(`tools.${kind}`)} — ${t(`tools.${kind}Hint`)}`} side="right">
              <button
                type="button"
                aria-pressed={on}
                aria-label={t(`tools.${kind}`)}
                onClick={() => onChange({ ...tool, kind })}
                className={cn(
                  "flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                  on && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                  focusRing,
                )}
              >
                <Icon className="size-4.5" aria-hidden />
              </button>
            </Hint>
            {/* The highlighter's colours, while it's the tool: a row beside it
                (the palette keeps its height, the page arrows stay put) */}
            {kind === "highlight" && on && (
              <div
                role="radiogroup"
                aria-label={t("menu.colour")}
                className="absolute top-0 left-full ml-2 flex items-center gap-0.5 rounded-full border border-border bg-background p-0.5 shadow-xs"
              >
                {HIGHLIGHT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={tool.color === c}
                    aria-label={t(`menu.colors.${c}`)}
                    title={t(`menu.colors.${c}`)}
                    onClick={() => onChange({ ...tool, color: c })}
                    className={cn("flex size-7 items-center justify-center rounded-full", focusRing)}
                  >
                    <span
                      className={cn(
                        "size-4.5 rounded-full",
                        tool.color === c && "ring-2 ring-foreground ring-offset-2 ring-offset-background",
                      )}
                      style={{ background: HIGHLIGHT_SWATCH[c] }}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Top of the sheet while a tool is on: what it does and how to stop. */
export function ToolStatus({ tool, onDone }: { tool: ReaderTool; onDone: () => void }) {
  const { t } = useTranslation();
  const on = tool.kind !== "select";
  const text = on ? t(`tools.${tool.kind}Status`, { color: t(`menu.colors.${tool.color}`) }) : "";
  return (
    <>
      {/* Always mounted: a live region born with its text often isn't read */}
      <span role="status" className="sr-only">
        {text}
      </span>
      {on && (
        <div className="pointer-events-auto absolute top-2 left-1/2 z-20 flex max-w-[calc(100%-7rem)] -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-background py-1 pr-1 pl-3 text-list shadow-xs">
          {tool.kind === "highlight" && (
            <span aria-hidden className="size-3 shrink-0 rounded-full" style={{ background: HIGHLIGHT_SWATCH[tool.color] }} />
          )}
          <span aria-hidden className="min-w-0 truncate">
            {text}
          </span>
          <button
            type="button"
            onClick={onDone}
            className={cn("shrink-0 rounded-full px-2.5 py-0.5 font-medium hover:bg-muted", focusRing)}
          >
            {t("tools.done")}
            <kbd className="ml-1.5 font-mono text-meta text-muted-foreground pointer-coarse:hidden">Esc</kbd>
          </button>
        </div>
      )}
    </>
  );
}
