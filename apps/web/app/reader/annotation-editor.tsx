import { useEffect, useRef, useState } from "react";
import type { AnnotationMark } from "@biblestdy/shared";
import { useTranslation } from "react-i18next";
import { cn, focusRing } from "~/lib/utils";

/** Pen styles in menu/editor order. */
export const MARK_STYLES = ["contour", "underline", "circle", "bracket"] as const;

/** Edit an annotation's text in place (margin box, or the in-flow line on
 * narrow screens): ⌘/Ctrl+Enter saves, Esc cancels, Delete removes. */
export function AnnotationEditor({
  text,
  onSave,
  onRemove,
  onCancel,
  mark,
  onMark,
  onRemoveText,
  className,
}: {
  text: string;
  /** How the words are marked — shown as a choice when given (several words). */
  mark?: AnnotationMark;
  onMark?: (mark: AnnotationMark) => void;
  /** Keep the mark, drop the margin text. */
  onRemoveText?: () => void;
  onSave: (text: string) => void;
  onRemove: () => void;
  onCancel: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(text);
  const ref = useRef<HTMLTextAreaElement>(null);
  // Opened on purpose (click / Enter on the annotation): focus the field
  useEffect(() => ref.current?.focus({ preventScroll: true }), []);
  const save = () => {
    const trimmed = draft.trim();
    if (trimmed) onSave(trimmed);
    else onCancel();
  };
  return (
    <div
      data-annotation-editing
      className={cn(
        "flex flex-col gap-1 rounded border border-border bg-popover p-1.5 text-left font-sans shadow-lg",
        className,
      )}
    >
      <textarea
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save();
          if (e.key === "Escape") {
            e.stopPropagation();
            onCancel();
          }
        }}
        aria-label={t("menu.annotationPlaceholder")}
        className={cn(
          "h-16 w-full resize-none rounded border border-primary/50 bg-background/80 p-1.5 font-serif text-control",
          focusRing,
        )}
      />
      {mark && onMark && (
        <div role="radiogroup" aria-label={t("marks.style")} className="flex flex-wrap items-center gap-0.5 text-meta">
          <span className="w-full text-muted-foreground">{t("marks.style")}</span>
          {MARK_STYLES.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mark === m}
              onClick={() => onMark(m)}
              className={cn(
                "min-h-6 rounded px-1.5 hover:bg-muted",
                mark === m && "bg-primary text-primary-foreground hover:bg-primary",
                focusRing,
              )}
            >
              {t(`marks.${m}`)}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-x-1 text-meta">
        <button
          type="button"
          className={cn("min-h-6 rounded px-1 text-muted-foreground hover:text-destructive", focusRing)}
          onClick={onRemove}
        >
          {t("note.delete")}
        </button>
        {onRemoveText && (
          <button
            type="button"
            className={cn("min-h-6 rounded px-1 text-muted-foreground hover:text-foreground", focusRing)}
            onClick={onRemoveText}
          >
            {t("marks.removeText")}
          </button>
        )}
        {!mark && <span className="text-muted-foreground pointer-coarse:hidden">{t("note.escCancel")}</span>}
        <button
          type="button"
          className={cn("min-h-6 rounded px-1 text-primary hover:opacity-80", focusRing)}
          onClick={save}
        >
          {t("note.save")}
        </button>
      </div>
    </div>
  );
}
