import { formatScriptureHref, type MarkLink, type ScriptureRef } from "@biblestdy/shared";
import { rootEditor$, useCellValue } from "@mdxeditor/editor";
import { COMMAND_PRIORITY_HIGH, KEY_DOWN_COMMAND, type BaseSelection } from "lexical";
import { BookPlus, Plus } from "lucide-react";
import { useContext, useEffect, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import { bookLocale } from "~/lib/book-name";
import { chipLabel } from "~/lib/reference-label";
import { cn, focusRing } from "~/lib/utils";
import { INSERT_VERSE, noteEditorMounted } from "./dialog-events";
import { focusEditor } from "./lexical-util";
import { ScriptureRefContext } from "./ref-context";
import { $insertScriptureRef, $restoreSelection, saveSelection } from "./scripture-ref-node";
import { useMarkKind, usePageMarks } from "./use-page-marks";
import { VerseRow } from "./verse-row";

/** Mod+Shift+E (Kasper): free in MDXEditor and the browsers' page keys. By
 * physical key, so any layout's E works. */
export function isVerseShortcut(e: Pick<KeyboardEvent, "code" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">): boolean {
  return e.code === "KeyE" && e.shiftKey && !e.altKey && (e.metaKey || e.ctrlKey);
}

/**
 * "+ Bibelvers" / "+ Verse" (#160): the word-labelled way to put a
 * reference in the text, first after undo/redo on every screen (`@` is the
 * shortcut, said in its tooltip). A ghost button — "+ Ny note" owns the only
 * fill. Opens the forgiving verse input in a dialog (a drawer on phones;
 * verse-picker.tsx),
 * keeping the editor's selection across the trip (iOS drops focus on a
 * toolbar tap): the chip lands where the caret was, else at the end. Also
 * opened by Mod+Shift+E in the editor and the palette's "Insert verse".
 */
export function VerseButton({ dock = false, onDockOpen }: { dock?: boolean; onDockOpen?: () => void } = {}) {
  const editor = useCellValue(rootEditor$);
  const { t, i18n } = useTranslation();
  const locale = bookLocale(i18n.language);
  const { mobile, kit } = useContext(ScriptureRefContext);
  const { Hint, VersePicker } = kit;
  const [open, setOpen] = useState(false);
  // Beside the reader: the page's marks, listed in the dialog (#191)
  const marks = usePageMarks();
  const markKind = useMarkKind();
  const saved = useRef<BaseSelection | null>(null);
  // Docked (the app, keyboard up): the bar's own verse search, in the
  // note's column (#277 V-A)
  const [row, setRow] = useState<HTMLElement | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLInputElement>(null);

  const start = () => {
    if (!editor) return;
    saved.current = saveSelection(editor);
    if (dock) openRow();
    else setOpen(true);
  };

  /** Into the verse search in the same tap: iOS keeps the keyboard only for
   * a field focused inside the gesture (Jonas F2) — so mounted at once
   * (flushSync) and focused here, not after a render. */
  function openRow() {
    const host = button.current?.closest<HTMLElement>(".note-docked");
    if (!host) return;
    onDockOpen?.();
    const box = host.querySelector<HTMLElement>('[contenteditable="true"]');
    const caret = box && caretInBox(box);
    flushSync(() => setRow(host));
    field.current?.focus({ preventScroll: true });
    // The list above the field takes room from the note: its caret's line
    // stays in sight (Elias F1)
    if (box && caret) {
      const bottom = caret.bottom - box.scrollTop;
      if (bottom > box.clientHeight - 8) box.scrollTop += bottom - box.clientHeight + 8;
    }
  }

  /** Back in the text in the same tap, the chip (if any) at the caret. */
  function closeRow(ref?: ScriptureRef, mark?: MarkLink) {
    if (editor) {
      const sel = saved.current;
      focusEditor(editor, () => {
        $restoreSelection(sel);
        const href = ref && formatScriptureHref(ref);
        if (ref && href) $insertScriptureRef(href, chipLabel(ref, locale).replace(/\u00a0/g, " "), mark ?? null);
      });
    }
    setRow(null);
  }

  useEffect(() => {
    if (!row) return;
    row.setAttribute("data-dock", "verse");
    return () => row.removeAttribute("data-dock");
  }, [row]);
  const startRef = useRef(start);
  useEffect(() => {
    startRef.current = start;
  });

  useEffect(() => {
    if (!editor) return;
    return editor.registerCommand(
      KEY_DOWN_COMMAND,
      (e) => {
        if (!isVerseShortcut(e)) return false;
        e.preventDefault();
        startRef.current();
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );
  }, [editor]);

  // The palette's "Insert verse" (offered while a note editor is open)
  useEffect(() => {
    const on = () => startRef.current();
    window.addEventListener(INSERT_VERSE, on);
    const unmount = noteEditorMounted();
    return () => {
      window.removeEventListener(INSERT_VERSE, on);
      unmount();
    };
  }, []);

  /** Back to the note: the caret where it was, or after the new chip. */
  function close(ref?: ScriptureRef, mark?: MarkLink) {
    setOpen(false);
    if (!editor) return;
    const sel = saved.current;
    // After the dialog has let go of focus
    requestAnimationFrame(() =>
      focusEditor(editor, () => {
        $restoreSelection(sel);
        const href = ref && formatScriptureHref(ref);
        if (ref && href) $insertScriptureRef(href, chipLabel(ref, locale).replace(/\u00a0/g, " "), mark ?? null);
      }),
    );
  }

  if (dock)
    return (
      <>
        <button
          ref={button}
          type="button"
          data-tour="note-verse"
          className="dock-button"
          aria-label={t("note.verseButton")}
          onPointerDown={() => editor && (saved.current = saveSelection(editor))}
          onClick={() => {
            const keep = saved.current;
            start();
            if (keep) saved.current = keep;
          }}
        >
          <BookPlus aria-hidden className="dock-glyph" />
        </button>
        {row &&
          createPortal(
            <VerseRow inputRef={field} marks={marks} describe={markKind} onPick={closeRow} onCancel={() => closeRow()} />,
            row,
          )}
      </>
    );

  return (
    <>
      <Hint label={t("note.verseHint")} shortcut="mod+Shift+E">
        {/* Its own tab stop (not in the toolbar's arrow-key group): the
            one control here with a word, found by Tab from the note */}
        <button
          type="button"
          data-tour="note-verse"
          // Before the click moves focus: the caret as it stood
          onPointerDown={() => editor && (saved.current = saveSelection(editor))}
          onClick={() => {
            const keep = saved.current;
            start();
            if (keep) saved.current = keep;
          }}
          className={cn(
            "relative inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-border bg-transparent px-2 text-list font-medium whitespace-nowrap text-foreground hover:bg-accent pointer-coarse:h-11",
            // Phones: unboxed and toolbar-high like the icons beside it; the
            // touch target stays 44px tall (an invisible hit area above and
            // below)
            mobile &&
              "border-transparent px-1.5 hover:bg-transparent active:bg-accent pointer-coarse:h-7 after:absolute after:inset-x-0 after:top-1/2 after:h-11 after:-translate-y-1/2",
            focusRing,
          )}
        >
          <Plus className="size-3.5 !text-muted-foreground" aria-hidden />
          {t("note.verseButton")}
        </button>
      </Hint>
      <VersePicker open={open} mobile={mobile} onClose={close} marks={marks} describe={markKind} />
    </>
  );
}

/** The caret's line in the editable's own coordinates (its scroll). */
function caretInBox(box: HTMLElement): { top: number; bottom: number } | null {
  const sel = window.getSelection();
  if (!sel?.rangeCount || !box.contains(sel.anchorNode)) return null;
  const rects = sel.getRangeAt(0).getClientRects();
  const node = sel.anchorNode;
  const line = node instanceof Element ? node : node?.parentElement;
  const r = rects.length ? rects[rects.length - 1] : line && line !== box ? line.getBoundingClientRect() : null;
  if (!r) return null;
  const top = box.getBoundingClientRect().top;
  return { top: r.top - top + box.scrollTop, bottom: r.bottom - top + box.scrollTop };
}
