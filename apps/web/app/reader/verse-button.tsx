import { formatScriptureHref, type ScriptureRef } from "@biblestdy/shared";
import { rootEditor$, useCellValue } from "@mdxeditor/editor";
import { COMMAND_PRIORITY_HIGH, KEY_DOWN_COMMAND, type BaseSelection } from "lexical";
import { Plus } from "lucide-react";
import { useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { bookLocale } from "~/lib/book-name";
import { chipLabel } from "~/lib/reference-label";
import { cn, focusRing } from "~/lib/utils";
import { INSERT_VERSE, noteEditorMounted } from "./dialog-events";
import { focusEditor } from "./lexical-util";
import { ScriptureRefContext } from "./ref-context";
import { $insertScriptureRef, $restoreSelection, saveSelection } from "./scripture-ref-node";
import { useMarkKind, usePageMarks } from "./use-page-marks";

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
export function VerseButton() {
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

  const start = () => {
    if (!editor) return;
    saved.current = saveSelection(editor);
    setOpen(true);
  };
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
  function close(ref?: ScriptureRef) {
    setOpen(false);
    if (!editor) return;
    const sel = saved.current;
    // After the dialog has let go of focus
    requestAnimationFrame(() =>
      focusEditor(editor, () => {
        $restoreSelection(sel);
        const href = ref && formatScriptureHref(ref);
        if (ref && href) $insertScriptureRef(href, chipLabel(ref, locale).replace(/\u00a0/g, " "));
      }),
    );
  }

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
