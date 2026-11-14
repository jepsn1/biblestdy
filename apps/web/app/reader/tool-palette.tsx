import type { AnnotationMark, HighlightColor } from "@biblestdy/shared";
import { HIGHLIGHT_COLORS } from "@biblestdy/shared";
import { Eraser, FileText, MousePointer2, PenLine, TextCursorInput, type LucideIcon } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Hint } from "~/components/hint";
import { useColorName } from "~/lib/highlight-labels";
import { cn, focusRing } from "~/lib/utils";
import { openColorNames } from "./color-names-dialog";
import { HIGHLIGHT_SWATCH } from "./highlight-colors";

/**
 * Tool-first study (desktop): the reader's two ways to mark the text, used
 * whichever suits the moment —
 * - Select (default): select words, then pick an action from the menu.
 * - A tool: pick it here, then every selection (drag, or a click on one
 *   word) gets it straight away — highlight in the tool's colour, annotate,
 *   start a note, or erase highlights/annotations.
 * Lives in the reader's left gutter, mouse/trackpad only (touch swipes
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

/** Does the full colour column fit under the tools in the pane? Its height
 * follows from a tool button's (all rem: text size scales it). */
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
    const measure = () => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const button = tools.querySelector("button")?.offsetHeight ?? 2.25 * rem;
      // 6 colours + name button, gaps, separator, padding, border; margins
      const colors = 7 * button + 1.5 * rem + 3;
      setOn(0.75 * rem + tools.offsetHeight + 0.5 * rem + colors + 0.75 * rem > host.clientHeight);
    };
    measure();
    const observer = new ResizeObserver(measure);
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
    <div ref={compact.ref} className="mx-auto mt-3 flex w-fit flex-col items-center gap-2 pointer-coarse:hidden">
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
          blue = highlight in blue). Named by the reader's own colour names. */}
      {compact.on ? (
        <CompactColors tool={tool} onChange={onChange} />
      ) : (
        <div role="toolbar" aria-orientation="vertical" aria-label={t("tools.highlight")} className={groupClass}>
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
          <div role="separator" className="my-0.5 h-px w-6 bg-border" />
          <NameColorsButton />
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

function NameColorsButton({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <Hint label={t("colorNames.open")} side="right">
      <button
        type="button"
        aria-label={t("colorNames.open")}
        aria-haspopup="dialog"
        onClick={(e) => openColorNames(e.currentTarget)}
        className={cn(buttonClass, className, focusRing)}
      >
        <TextCursorInput className="size-4.5" aria-hidden />
      </button>
    </Hint>
  );
}

/** Too short a pane for the colour column (a low window, big text): one
 * highlighter button in the last colour, its colours a row beside it while
 * it's the tool — like the pen's styles. */
function CompactColors({ tool, onChange }: { tool: ReaderTool; onChange: (tool: ReaderTool) => void }) {
  const { t } = useTranslation();
  const { title } = useColorName();
  const on = tool.kind === "highlight";
  const label = `${t("tools.highlight")} (${title(tool.color)})`;
  return (
    <div role="toolbar" aria-orientation="vertical" aria-label={t("tools.highlight")} className={cn(groupClass, "relative")}>
      <Hint label={`${label} — ${t("tools.highlightHint")}`} shortcut="Shift+H" side="right">
        <button
          type="button"
          aria-pressed={on}
          aria-label={label}
          aria-keyshortcuts="Shift+H"
          onClick={() => onChange({ ...tool, kind: "highlight" })}
          className={cn(buttonClass, on && "bg-muted hover:bg-muted", focusRing)}
        >
          <Swatch color={tool.color} on={on} />
        </button>
      </Hint>
      {on && (
        <div className="absolute top-0 left-full ml-2 flex items-center gap-0.5 rounded-full border border-border bg-background p-1 shadow-xs">
          <div role="radiogroup" aria-label={t("menu.colour")} className="flex items-center gap-0.5">
            {HIGHLIGHT_COLORS.map((c, i) => (
              <Hint key={c} label={title(c)} shortcut={String(i + 1)} side="bottom">
                <button
                  type="button"
                  role="radio"
                  aria-checked={tool.color === c}
                  aria-label={title(c)}
                  aria-keyshortcuts={String(i + 1)}
                  onClick={() => onChange({ ...tool, color: c })}
                  className={cn("flex size-8 items-center justify-center rounded-full hover:bg-muted", focusRing)}
                >
                  <Swatch color={c} on={tool.color === c} />
                </button>
              </Hint>
            ))}
          </div>
          <NameColorsButton className="size-8 rounded-full" />
        </div>
      )}
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
