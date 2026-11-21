import { announce } from "~/lib/announce";
import type { NoteAtWord } from "./word-click";

type T = (key: string, o?: Record<string, unknown>) => string;

/** The eraser over a link (#212; a bracket too, #211): links are never
 * erased here. Says which note holds it — read out, not shown (#257); with
 * the eraser off, the link opens that note. */
export function linkedHint(t: T, notes: NoteAtWord[]) {
  if (notes.length === 0) return;
  announce(
    notes.length === 1
      ? t("announce.eraseLinked", { title: notes[0].title || t("note.untitled") })
      : t("announce.eraseLinkedMany", { count: notes.length }),
  );
}
