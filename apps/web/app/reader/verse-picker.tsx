import type { ScriptureRef } from "@biblestdy/shared";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "~/components/ui/drawer";
import { ScrollArea } from "~/components/ui/scroll-area";
import { bookLocale } from "~/lib/book-name";
import { cn, focusRing } from "~/lib/utils";
import { VerseField } from "../notes/add-reference";
import { filterMarks, type PageMark } from "../notes/page-marks";
import { MarkRow } from "./mark-row";

export type VersePickerProps = {
  open: boolean;
  mobile: boolean;
  /** Closed: with the reference picked, or none (Esc, ×, outside). */
  onClose: (ref?: ScriptureRef) => void;
  /** The open chapter's marks (#191), listed under the field. */
  marks?: PageMark[];
  /** A mark's kind in words. */
  describe?: (m: PageMark) => string;
};

/**
 * "+ Verse"'s picker (#160): the forgiving verse input in a dialog — a
 * drawer on phones — with focus in the field; Enter inserts. Its own chunk
 * (note-panel loads it when idle), so neither the reader's first paint nor
 * the editor chunk carries Base UI's dialog and drawer.
 */
export function VersePicker({ open, mobile, onClose, marks = [], describe = () => "" }: VersePickerProps) {
  const { t, i18n } = useTranslation();
  const locale = bookLocale(i18n.language);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const headId = useId();
  const [text, setText] = useState("");
  /** Next time it opens empty, as the field does. */
  const close = (ref?: ScriptureRef) => {
    setText("");
    onClose(ref);
  };
  const shown = filterMarks(marks, text, locale, describe);
  const buttons = () => [...(listRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
  /** ↑↓ walk the list; ↑ from the first goes back to the field. */
  function onListKey(e: KeyboardEvent) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const all = buttons();
    const at = all.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    e.preventDefault();
    if (e.key === "ArrowUp" && at === 0) inputRef.current?.focus();
    else all[Math.max(0, Math.min(all.length - 1, at + (e.key === "ArrowDown" ? 1 : -1)))]?.focus();
  }
  const onPage = shown.length > 0 && (
    <section aria-labelledby={headId} className="mt-1 flex min-h-0 flex-col gap-1">
      <h3 id={headId} className="px-0.5 font-sans text-meta font-medium text-muted-foreground">
        {t("note.typeaheadOnPage")}
      </h3>
      <ScrollArea viewportClassName="max-h-[min(18rem,40dvh)]">
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- arrow keys between the buttons */}
        <ul ref={listRef} onKeyDown={onListKey} className="flex flex-col gap-0.5 p-0.5">
          {shown.map((m) => (
            <li key={m.href}>
              <button
                type="button"
                onClick={() => close(m.ref)}
                className={cn(
                  "flex min-h-11 w-full items-center rounded-md px-2 py-1.5 text-list hover:bg-accent/60",
                  !mobile && "pointer-fine:min-h-9",
                  focusRing,
                )}
              >
                <MarkRow mark={m} locale={locale} kind={describe(m)} />
              </button>
            </li>
          ))}
        </ul>
      </ScrollArea>
    </section>
  );
  const field = (
    <VerseField
      onTextChange={setText}
      onArrowDown={() => buttons()[0]?.focus()}
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
  // Focus goes back to the note by the editor's own hand (verse-button)
  return mobile ? (
    <Drawer open={open} onOpenChange={(o) => !o && close()}>
      <DrawerContent className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))]" initialFocus={inputRef} finalFocus={false}>
        <DrawerHeader className="px-0">
          <DrawerTitle>{t("note.insertVerseTitle")}</DrawerTitle>
          <DrawerDescription>{t("note.insertVerseDescription")}</DrawerDescription>
        </DrawerHeader>
        {field}
        {onPage}
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
        {onPage}
      </DialogContent>
    </Dialog>
  );
}
