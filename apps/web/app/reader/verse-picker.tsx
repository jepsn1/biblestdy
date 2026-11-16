import type { ScriptureRef } from "@biblestdy/shared";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "~/components/ui/drawer";
import { VerseField } from "../notes/add-reference";

export type VersePickerProps = {
  open: boolean;
  mobile: boolean;
  /** Closed: with the reference picked, or none (Esc, ×, outside). */
  onClose: (ref?: ScriptureRef) => void;
};

/**
 * "+ Verse"'s picker (#160): the forgiving verse input in a dialog — a
 * drawer on phones — with focus in the field; Enter inserts. Its own chunk
 * (note-panel loads it when idle), so neither the reader's first paint nor
 * the editor chunk carries Base UI's dialog and drawer.
 */
export function VersePicker({ open, mobile, onClose }: VersePickerProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const field = (
    <VerseField
      inputRef={inputRef}
      onPick={(ref) => {
        onClose(ref);
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
    <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))]" initialFocus={inputRef} finalFocus={false}>
        <DrawerHeader className="px-0">
          <DrawerTitle>{t("note.insertVerseTitle")}</DrawerTitle>
          <DrawerDescription>{t("note.insertVerseDescription")}</DrawerDescription>
        </DrawerHeader>
        {field}
      </DrawerContent>
    </Drawer>
  ) : (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent initialFocus={inputRef} finalFocus={false}>
        <DialogHeader>
          <DialogTitle>{t("note.insertVerseTitle")}</DialogTitle>
          <DialogDescription>{t("note.insertVerseDescription")}</DialogDescription>
        </DialogHeader>
        {field}
      </DialogContent>
    </Dialog>
  );
}
