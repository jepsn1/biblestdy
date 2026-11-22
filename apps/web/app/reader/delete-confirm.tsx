import { useEffect, useId, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "~/components/ui/button";

export type DeleteConfirmProps = { title: string; onKeep: () => void; onDelete: () => void };

/**
 * "Delete “Sermon”? You can restore it for 30 days…" (#261 panel Q3): one
 * row under the header, where the eye is — not a modal over the writing.
 * Focus lands on Keep (the safe choice, filled); Enter or Esc there keeps
 * the note — only Delete deletes.
 */
export function DeleteConfirm({ title, onKeep, onDelete }: DeleteConfirmProps) {
  const { t } = useTranslation();
  const keepRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => keepRef.current?.focus({ preventScroll: true }), []);
  // Esc on either button keeps the note (and doesn't close the panel)
  const escKeeps = (e: React.KeyboardEvent) => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    e.stopPropagation();
    onKeep();
  };
  return (
    <div
      role="group"
      aria-labelledby={id}
      data-note-confirm=""
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border bg-muted/60 px-3 py-2 text-control"
    >
      <p id={id} className="min-w-0 basis-full">
        {title ? t("note.confirmDelete", { title }) : t("note.confirmDeleteUntitled")}
      </p>
      <Button ref={keepRef} size="sm" className="max-md:h-11 max-md:px-4" onClick={onKeep} onKeyDown={escKeeps}>
        {t("note.keep")}
      </Button>
      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive max-md:h-11" onClick={onDelete} onKeyDown={escKeeps}>
        {t("note.deleteNote")}
      </Button>
    </div>
  );
}
