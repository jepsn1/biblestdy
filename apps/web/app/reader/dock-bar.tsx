import {
  activeEditor$,
  applyFormat$,
  applyListType$,
  currentFormat$,
  currentListType$,
  editorInTable$,
  IS_BOLD,
  IS_ITALIC,
  IS_UNDERLINE,
  useCellValues,
  usePublisher,
  useTranslation as useEditorTranslation,
} from "@mdxeditor/editor";
import { CAN_REDO_COMMAND, CAN_UNDO_COMMAND, COMMAND_PRIORITY_CRITICAL, REDO_COMMAND, UNDO_COMMAND } from "lexical";
import { Bold, CaseSensitive, Italic, List, ListChecks, ListOrdered, Redo2, Underline, Undo2, type LucideIcon } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { hideKeyboard } from "~/lib/native-touch";
import { mergeRegister } from "./lexical-util";
import { VerseButton } from "./verse-button";

/**
 * The note's format bar docked on the keyboard in the app (#273, redesigned
 * by the #277 panel). Like Apple Notes' bar: only actions on the bar, the
 * toggles grouped in a format panel —
 *
 *   [Aa] [Verse]  ·······  [↶ ↷] [⌄]
 *
 * Aa opens the panel over the bar (it pushes the text up, Jonas F6): Text
 * style `[B | I | U]` (several at once) and Lists `[• | 1. | ☑]` (one at a
 * time; the lit one turns the list off). Our own buttons with aria-pressed:
 * MDXEditor's toggles are one-item radiogroups, undo/redo radios (Sofie F4,
 * Jonas F1). Five controls in sight at every width and text size — no
 * sideways scroll; undo always in sight (Birthe).
 */
export function DockBar() {
  const { t } = useTranslation();
  const [formatOpen, setFormatOpen] = useState(false);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const editor = useEditor();
  const anchor = useRef<HTMLSpanElement>(null);
  const panelId = useId();

  // The panel lives beside the bar in the note's column (a sibling, so it
  // takes room instead of covering the caret's line)
  useEffect(() => setHost(anchor.current?.closest<HTMLElement>(".note-docked") ?? null), []);

  // A tap in the text closes it (before Lexical moves the caret)
  useEffect(() => {
    const root = editor?.getRootElement();
    if (!formatOpen || !root) return;
    const close = () => setFormatOpen(false);
    root.addEventListener("pointerdown", close);
    return () => root.removeEventListener("pointerdown", close);
  }, [formatOpen, editor]);

  useEffect(() => {
    host?.toggleAttribute("data-format-open", formatOpen);
  }, [host, formatOpen]);

  return (
    <>
      <span ref={anchor} hidden />
      <Platter>
        <DockButton
          icon={CaseSensitive}
          label={t("note.dockFormat")}
          pressed={formatOpen}
          expanded={formatOpen}
          controls={panelId}
          onClick={() => setFormatOpen((o) => !o)}
          data-dock-format=""
        />
      </Platter>
      <Platter>
        <VerseButton dock onDockOpen={() => setFormatOpen(false)} />
      </Platter>
      <span className="dock-spacer" aria-hidden />
      <History />
      <Platter>
        <HideKeyboard onHide={() => setFormatOpen(false)} />
      </Platter>
      {host && formatOpen && createPortal(<FormatPanel id={panelId} />, host)}
    </>
  );
}

function useEditor() {
  const [editor] = useCellValues(activeEditor$);
  return editor;
}

/** A group on the bar: one rounded platter (iOS 26's shared background). */
function Platter({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div role={label ? "group" : undefined} aria-label={label} className="dock-platter">
      {children}
    </div>
  );
}

/** One glyph on the glyph line, its accessible name in words; an action
 * unless `pressed` is given (then a toggle: aria-pressed). */
export function DockButton({
  icon: Icon,
  label,
  pressed,
  expanded,
  controls,
  disabled,
  onClick,
  children,
  ...rest
}: {
  icon: LucideIcon;
  label: string;
  pressed?: boolean;
  expanded?: boolean;
  controls?: string;
  disabled?: boolean;
  onClick: () => void;
  children?: ReactNode;
  [data: `data-${string}`]: string;
}) {
  return (
    <button
      type="button"
      className="dock-button"
      aria-label={children ? undefined : label}
      aria-pressed={pressed}
      aria-expanded={expanded}
      aria-controls={controls}
      disabled={disabled}
      onClick={onClick}
      {...rest}
    >
      <Icon aria-hidden className="dock-glyph" />
      {children}
    </button>
  );
}

function History() {
  const tr = useEditorTranslation();
  const { t } = useTranslation();
  const editor = useEditor();
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  useEffect(() => {
    if (!editor) return;
    return mergeRegister(
      editor.registerCommand(CAN_UNDO_COMMAND, (v) => (setCanUndo(v), false), COMMAND_PRIORITY_CRITICAL),
      editor.registerCommand(CAN_REDO_COMMAND, (v) => (setCanRedo(v), false), COMMAND_PRIORITY_CRITICAL),
    );
  }, [editor]);
  return (
    <Platter label={t("note.dockHistory")}>
      <DockButton icon={Undo2} label={tr("toolbar.undo", "Undo")} disabled={!canUndo} onClick={() => editor?.dispatchCommand(UNDO_COMMAND, undefined)} />
      <DockButton icon={Redo2} label={tr("toolbar.redo", "Redo")} disabled={!canRedo} onClick={() => editor?.dispatchCommand(REDO_COMMAND, undefined)} />
    </Platter>
  );
}

/** Last on the bar: the keyboard goes away (the hidden accessory bar's ✓). */
function HideKeyboard({ onHide }: { onHide: () => void }) {
  const tr = useEditorTranslation();
  return (
    <button
      type="button"
      className="dock-button"
      data-hide-keyboard=""
      aria-label={tr("dock.hideKeyboard", "Hide keyboard")}
      onClick={() => {
        onHide();
        hideKeyboard();
      }}
    >
      <KeyboardDown />
    </button>
  );
}

/** iOS's own "hide keyboard" glyph (#273 Q5): a keyboard with ⌄ under it. */
function KeyboardDown() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="dock-glyph">
      <rect x="2" y="3" width="20" height="12" rx="2" />
      <path d="M6 7h.01M10 7h.01M14 7h.01M18 7h.01M8 11h8M9 19l3 2.5 3-2.5" />
    </svg>
  );
}

const STYLES = [
  { format: IS_BOLD, name: "bold", key: "toolbar.bold", fallback: "Bold", icon: Bold },
  { format: IS_ITALIC, name: "italic", key: "toolbar.italic", fallback: "Italic", icon: Italic },
  { format: IS_UNDERLINE, name: "underline", key: "toolbar.underline", fallback: "Underline", icon: Underline },
] as const;
const LISTS = [
  { type: "bullet", key: "toolbar.bulletedList", fallback: "Bulleted list", icon: List },
  { type: "number", key: "toolbar.numberedList", fallback: "Numbered list", icon: ListOrdered },
  { type: "check", key: "toolbar.checkList", fallback: "Check list", icon: ListChecks },
] as const;

/** The lit list turns the list off; another one switches to it. */
export function nextListType<T extends string>(current: T | "", tapped: T): T | "" {
  return current === tapped ? "" : tapped;
}

/** Aa's panel: two segmented rows, the caret's state lit. */
function FormatPanel({ id }: { id: string }) {
  const tr = useEditorTranslation();
  const { t } = useTranslation();
  const [format, listType, inTable] = useCellValues(currentFormat$, currentListType$, editorInTable$);
  const applyFormat = usePublisher(applyFormat$);
  const applyList = usePublisher(applyListType$);
  return (
    <div id={id} className="dock-panel" data-dock-panel="">
      <div role="group" aria-label={t("note.dockStyle")} className="dock-segments">
        {STYLES.map((s) => (
          <DockButton key={s.name} icon={s.icon} label={tr(s.key, s.fallback)} pressed={(format & s.format) !== 0} onClick={() => applyFormat(s.name)} />
        ))}
      </div>
      <div role="group" aria-label={t("note.dockLists")} className="dock-segments">
        {LISTS.map((l) => (
          <DockButton
            key={l.type}
            icon={l.icon}
            label={tr(l.key, l.fallback)}
            pressed={listType === l.type}
            disabled={inTable}
            onClick={() => applyList(nextListType(listType, l.type))}
          />
        ))}
      </div>
    </div>
  );
}
