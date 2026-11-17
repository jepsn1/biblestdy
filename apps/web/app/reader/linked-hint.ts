import type { WordPos } from "@biblestdy/shared";
import { toast } from "sonner";
import type { NoteAtWord } from "./word-click";

type T = (key: string, o?: Record<string, unknown>) => string;

/** The eraser over a link (#212; a bracket too, #211): links are never
 * erased here — say which note holds it, with the way there. One toast,
 * updated by repeated strokes. */
export function linkedHint(
  t: T,
  notes: NoteAtWord[],
  at: WordPos,
  onOpenNote: (noteId: string, at: WordPos) => void,
) {
  if (notes.length === 0) return;
  const first = notes[0];
  toast(
    notes.length === 1
      ? t("toast.eraseLinked", { title: first.title || t("note.untitled") })
      : t("toast.eraseLinkedMany", { count: notes.length }),
    {
      id: "erase-linked",
      action: { label: t("note.open"), onClick: () => onOpenNote(first.noteId, { verse: at.verse, word: at.word }) },
    },
  );
}
