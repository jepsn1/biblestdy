import { formatScriptureHref, type ScriptureRef } from "@biblestdy/shared";
import { Button as ToolbarButton, rootEditor$, useCellValue } from "@mdxeditor/editor";
import { COMMAND_PRIORITY_HIGH, KEY_DOWN_COMMAND, type BaseSelection } from "lexical";
import { Plus } from "lucide-react";
import { useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Hint } from "~/components/hint";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "~/components/ui/drawer";
import { bookLocale } from "~/lib/book-name";
import { chipLabel } from "~/lib/reference-label";
import { cn } from "~/lib/utils";
import { VerseField } from "../notes/add-reference";
import { INSERT_VERSE, noteEditorMounted } from "./dialog-events";
import { ScriptureRefContext } from "./ref-context";
import { $insertScriptureRef, $restoreSelection, saveSelection } from "./scripture-ref-node";

/** Mod+Shift+E (Kasper): free in MDXEditor and the browsers' page keys. By
 * physical key, so any layout's E works. */
export function isVerseShortcut(e: Pick<KeyboardEvent, "code" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">): boolean {
  return e.code === "KeyE" && e.shiftKey && !e.altKey && (e.metaKey || e.ctrlKey);
}

/**
 * "+ Bibelvers" / "+ Verse" (#160): the word-labelled way to put a
 * reference in the text, first after undo/redo on every screen (`@` is the
 * shortcut, said in its tooltip). A ghost button — "+ Ny note" owns the only
 * fill. Opens the forgiving verse input in a dialog (a drawer on phones),
 * keeping the editor's selection across the trip (iOS drops focus on a
 * toolbar tap): the chip lands where the caret was, else at the end. Also
 * opened by Mod+Shift+E in the editor and the palette's "Insert verse".
 */
export function VerseButton() {
  const editor = useCellValue(rootEditor$);
  const { t, i18n } = useTranslation();
  const locale = bookLocale(i18n.language);
  const { mobile } = useContext(ScriptureRefContext);
  const [open, setOpen] = useState(false);
  const saved = useRef<BaseSelection | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
    editor.update(() => {
      $restoreSelection(saved.current);
      const href = ref && formatScriptureHref(ref);
      if (ref && href) $insertScriptureRef(href, chipLabel(ref, locale).replace(/ /g, " "));
    });
    requestAnimationFrame(() => editor.focus());
  }

  const field = (
    <VerseField
      inputRef={inputRef}
      onPick={(ref) => {
        close(ref);
        return null;
      }}
      label={t("note.insertVerseLabel")}
      placeholder={t("note.insertVersePlaceholder")}
      previewKey="note.insertPreview"
      submitLabel={t("note.insert")}
      mobile={mobile}
    />
  );

  return (
    <>
      <Hint label={t("note.verseHint")} shortcut="mod+Shift+E">
        <ToolbarButton
          type="button"
          // Before the click moves focus: the caret as it stood
          onPointerDown={() => editor && (saved.current = saveSelection(editor))}
          onClick={() => {
            const keep = saved.current;
            start();
            if (keep) saved.current = keep;
          }}
          className={cn(
            "!inline-flex !h-7 !w-auto items-center gap-1 !rounded-md border border-border !bg-transparent !px-2 text-list font-medium text-foreground hover:!bg-accent pointer-coarse:!h-11",
            mobile && "!h-11",
          )}
        >
          <Plus className="!size-3.5 text-muted-foreground" aria-hidden />
          {t("note.verseButton")}
        </ToolbarButton>
      </Hint>
      {mobile ? (
        <Drawer open={open} onOpenChange={(o) => !o && close()}>
          <DrawerContent className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))]" initialFocus={inputRef} finalFocus={false}>
            <DrawerHeader className="px-0">
              <DrawerTitle>{t("note.insertVerseTitle")}</DrawerTitle>
              <DrawerDescription>{t("note.insertVerseDescription")}</DrawerDescription>
            </DrawerHeader>
            {field}
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={open} onOpenChange={(o) => !o && close()}>
          <DialogContent initialFocus={inputRef} finalFocus={false}>
            <DialogHeader>
              <DialogTitle>{t("note.insertVerseTitle")}</DialogTitle>
              <DialogDescription>{t("note.insertVerseDescription")}</DialogDescription>
            </DialogHeader>
            {field}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
