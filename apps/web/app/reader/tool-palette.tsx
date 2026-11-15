import type { AnnotationMark, HighlightColor } from "@biblestdy/shared";
import { HIGHLIGHT_COLORS } from "@biblestdy/shared";
import { Eraser, FileText, Highlighter, MousePointer2, PenLine, type LucideIcon } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { Hint } from "~/components/hint";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "~/components/ui/popover";
import { ScrollArea } from "~/components/ui/scroll-area";
import { useColorName } from "~/lib/highlight-labels";
import { cn, focusRing } from "~/lib/utils";
import { COLOUR_KEY_ATTR } from "./colour-key";
import { HIGHLIGHT_SWATCH } from "./highlight-colors";

/**
 * Tool-first study (desktop): the reader's two ways to mark the text, used
 * whichever suits the moment —
 * - Select (default): select words, then pick an action from the menu.
 * - A tool: pick it here, then every selection (drag, or a click on one
 *   word) gets it straight away — highlight in the tool's colour, annotate,
 *   start a note, or erase highlights/annotations.
 * Lives in the reader's left gutter, on the same inset as the colour key
 * under it (the key names and filters colours; the palette only applies
 * them). Mouse/trackpad only (touch swipes
 * and selects with the menu); never persisted (a reload is back to
 * Select, so nobody is surprised by a mode they forgot).
 */

export type ToolKind = "select" | "highlight" | "annotate" | "note" | "erase";
/** The pen writes margin text ("text"), or just marks the words in a style. */
export type PenStyle = "text" | AnnotationMark;
export const PEN_STYLES: PenStyle[] = ["text", "contour", "underline", "circle", "bracket"];
export type ReaderTool = { kind: ToolKind; color: HighlightColor; pen: PenStyle };

/** The palette's other tools — the highlighter is its colours, below. */
const TOOLS: { kind: Exclude<ToolKind, "highlight">; icon: LucideIcon; key: string }[] = [
  { kind: "select", icon: MousePointer2, key: "V" },
  { kind: "annotate", icon: PenLine, key: "Shift+M" },
  { kind: "note", icon: FileText, key: "Shift+N" },
  { kind: "erase", icon: Eraser, key: "Shift+E" },
];

/** Shift + the action menu's letter (h, m, n) picks a tool; V = Select.
 * Shift+H = the highlighter in its last colour; 1–6 then change colour. */
export const TOOL_KEYS: Record<string, ToolKind> = { H: "highlight", M: "annotate", N: "note", E: "erase" };

/** A palette group: its corners concentric with the buttons' (button radius
 * + padding + border), so the first/last button sits evenly in the curve. */
const groupClass =
  "flex flex-col items-center gap-0.5 rounded-[calc(var(--radius-lg)+0.25rem+1px)] border border-border bg-background p-1 shadow-xs";
const buttonClass =
  "flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";
const onClass = "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground";

/** Does the full colour column fit between the tools and the colour key in
 * the pane? Its height follows from a tool button's (all rem: text size
 * scales it). */
function useCompact() {
  const ref = useRef<HTMLDivElement>(null);
  const toolsRef = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useLayoutEffect(() => {
    // The gutter is absolutely placed; its own positioned parent is the pane
    const gutter = ref.current?.offsetParent as HTMLElement | null | undefined;
    const host = gutter?.offsetParent;
    const tools = toolsRef.current;
    if (!host || !tools) return;
    const observer = new ResizeObserver(() => measure());
    const measure = () => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const button = tools.querySelector("button")?.offsetHeight ?? 2.25 * rem;
      // 6 colours, the highlighter mark, gaps, padding, border
      const colors = 6 * button + 1.75 * rem + 1.125 * rem + 2;
      // The key below (in the margin or the gutter), and the gap to it
      const key = host.querySelector<HTMLElement>(`[${COLOUR_KEY_ATTR}]`);
      if (key) observer.observe(key); // it grows when opened or named
      const below = key ? key.offsetHeight + 0.75 * rem : 0;
      setOn(0.75 * rem + tools.offsetHeight + 0.5 * rem + colors + 0.75 * rem + below > host.clientHeight);
    };
    measure();
    observer.observe(host);
    observer.observe(tools);
    return () => observer.disconnect();
  }, []);
  return { ref, toolsRef, on };
}

export function ToolPalette({
  tool,
  onChange,
}: {
  tool: ReaderTool;
  onChange: (tool: ReaderTool) => void;
}) {
  const { t } = useTranslation();
  const { title } = useColorName();
  const highlighting = tool.kind === "highlight";
  const compact = useCompact();
  return (
    <div ref={compact.ref} className="mt-reader-inset ml-reader-inset flex w-fit flex-col items-center gap-2 pointer-coarse:hidden">
      <div ref={compact.toolsRef} role="toolbar" aria-orientation="vertical" aria-label={t("tools.label")} className={groupClass}>
        {TOOLS.map(({ kind, icon: Icon, key }) => {
          const on = tool.kind === kind;
          return (
            <div key={kind} className="relative">
              <Hint label={`${t(`tools.${kind}`)} — ${t(`tools.${kind}Hint`)}`} shortcut={key} side="right">
                <button
                  type="button"
                  aria-pressed={on}
                  aria-label={t(`tools.${kind}`)}
                  aria-keyshortcuts={key}
                  onClick={() => onChange({ ...tool, kind })}
                  className={cn(buttonClass, on && onClass, focusRing)}
                >
                  <Icon className="size-4.5" aria-hidden />
                </button>
              </Hint>
              {/* The pen's styles, while it's the tool: worded, keys 1–5 */}
              {kind === "annotate" && on && (
                <div
                  role="radiogroup"
                  aria-label={t("marks.style")}
                  className="absolute top-0 left-full ml-3 flex items-center gap-0.5 rounded-full border border-border bg-background p-1 shadow-xs"
                >
                  {PEN_STYLES.map((m, i) => (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={tool.pen === m}
                      aria-keyshortcuts={String(i + 1)}
                      title={`${m === "text" ? t("marks.text") : t(`marks.${m}`)} (${i + 1})`}
                      onClick={() => onChange({ ...tool, pen: m })}
                      className={cn(
                        "h-7 rounded-full px-2.5 text-meta whitespace-nowrap hover:bg-muted",
                        tool.pen === m && "bg-primary text-primary-foreground hover:bg-primary",
                        focusRing,
                      )}
                    >
                      {m === "text" ? t("marks.text") : t(`marks.${m}`)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* The highlighter, as its colours: each one a tool of its own (click
          blue = highlight in blue), under the highlighter's mark so they
          read as pens, not the key's filter. Named by the reader's own
          colour names (tooltips); naming them is the key's. */}
      {compact.on ? (
        <CompactColors tool={tool} onChange={onChange} />
      ) : (
        <div role="toolbar" aria-orientation="vertical" aria-label={t("tools.highlight")} className={groupClass}>
          <span aria-hidden className="flex h-7 items-center text-muted-foreground">
            <Highlighter className="size-4" />
          </span>
          {HIGHLIGHT_COLORS.map((c, i) => {
            const on = highlighting && tool.color === c;
            // Keys: 1–6 while highlighting; else Shift+H picks the last colour
            const key = highlighting ? String(i + 1) : c === tool.color ? "Shift+H" : undefined;
            return (
              <Hint key={c} label={`${title(c)} — ${t("tools.highlightHint")}`} shortcut={key} side="right">
                <button
                  type="button"
                  aria-pressed={on}
                  aria-label={title(c)}
                  aria-keyshortcuts={key}
                  onClick={() => onChange({ ...tool, kind: "highlight", color: c })}
                  // On: a ring, not the gold fill (gold on gold vanishes)
                  className={cn(buttonClass, on && "bg-muted hover:bg-muted", focusRing)}
                >
                  <Swatch color={c} on={on} />
                </button>
              </Hint>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Swatch({ color, on }: { color: HighlightColor; on: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "size-5 rounded-full ring-1 ring-foreground/15",
        on && "ring-2 ring-foreground ring-offset-2 ring-offset-muted",
      )}
      style={{ background: HIGHLIGHT_SWATCH[color] }}
    />
  );
}

/** Too short a pane for the colour column (a low window, big text): one
 * highlighter button in the last colour; it opens the six colours as a
 * list beside it — swatch and name, ↑/↓ to move (each one picked as it's
 * reached), Enter/click to pick and close, Esc back to the button. */
function CompactColors({ tool, onChange }: { tool: ReaderTool; onChange: (tool: ReaderTool) => void }) {
  const { t } = useTranslation();
  const { title } = useColorName();
  const [open, setOpen] = useState(false);
  const on = tool.kind === "highlight";
  const label = `${t("tools.highlight")} (${title(tool.color)})`;
  const pick = (color: HighlightColor) => onChange({ ...tool, kind: "highlight", color });
  return (
    <div className={groupClass}>
      <Popover open={open} onOpenChange={setOpen}>
        <Hint label={`${label} — ${t("tools.chooseColour")}`} shortcut="Shift+H" side="right">
          <PopoverTrigger
            render={
              <button
                type="button"
                aria-label={label}
                aria-keyshortcuts="Shift+H"
                className={cn(buttonClass, (on || open) && "bg-muted hover:bg-muted", focusRing)}
              />
            }
          >
            <Swatch color={tool.color} on={on} />
          </PopoverTrigger>
        </Hint>
        <PopoverContent side="right" align="start" sideOffset={8} className="max-h-(--available-height) w-auto min-w-48 gap-0 p-0">
          <PopoverTitle className="px-3 pt-2.5 pb-1 text-meta font-normal text-muted-foreground">{t("tools.highlight")}</PopoverTitle>
          <ScrollArea viewportClassName="max-h-[calc(var(--available-height)-2.5rem)]">
            <RadioGroup
              value={tool.color}
              // Arrows move and pick at once (a radio group); the tool goes on
              onValueChange={(c) => pick(c as HighlightColor)}
              aria-label={t("menu.colour")}
              className="flex flex-col gap-0.5 p-1"
            >
              {HIGHLIGHT_COLORS.map((c, i) => (
                <Radio.Root
                  key={c}
                  value={c}
                  aria-keyshortcuts={on ? String(i + 1) : undefined}
                  // Click / Enter / Space: pick (even the current one) and close
                  onClick={() => {
                    pick(c);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex min-h-9 items-center gap-2.5 rounded-lg px-2 text-left text-control hover:bg-muted data-checked:bg-muted",
                    focusRing,
                  )}
                >
                  <Swatch color={c} on={on && tool.color === c} />
                  <span className="flex-1">{title(c)}</span>
                  <kbd aria-hidden className="font-mono text-meta text-muted-foreground">
                    {i + 1}
                  </kbd>
                </Radio.Root>
              ))}
            </RadioGroup>
          </ScrollArea>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/** Top of the sheet while a tool is on: what it does and how to stop. */
export function ToolStatus({ tool, onDone }: { tool: ReaderTool; onDone: () => void }) {
  const { t } = useTranslation();
  const { name } = useColorName();
  const on = tool.kind !== "select";
  const text = !on
    ? ""
    : tool.kind === "annotate" && tool.pen !== "text"
      ? t("tools.markStatus", { style: t(`marks.${tool.pen}`) })
      : t(`tools.${tool.kind}Status`, { color: name(tool.color) });
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
