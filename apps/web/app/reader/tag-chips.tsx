import { useTranslation } from "react-i18next";
import type { Tag } from "@biblestdy/shared";
import { X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

/**
 * Tag chips + inline add box (issue #10). A chip links to its topic page;
 * chips with onRemove carry an ×. Enter adds, empty input blurs away.
 */
export function TagChips({
  tags,
  onAdd,
  onRemove,
  addLabel,
}: {
  tags: Tag[];
  onAdd: (name: string) => void;
  /** Absent = chips are read-only links (e.g. note-derived topics). */
  onRemove?: (tag: Tag) => void;
  addLabel?: string;
}) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  function submit() {
    const name = draft.trim();
    if (name) onAdd(name);
    setDraft("");
    setAdding(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((tg) => (
        <span
          key={tg.id}
          className="flex items-center gap-1 rounded-full border border-border bg-muted/50 py-0.5 pr-1.5 pl-2 font-mono text-[0.65rem] text-muted-foreground"
        >
          <Link
            to={`/topic/${encodeURIComponent(tg.name)}`}
            title={t("tags.openTopic")}
            className="hover:text-primary"
          >
            {tg.name}
          </Link>
          {onRemove && (
            <button
              type="button"
              aria-label={t("tags.remove", { name: tg.name })}
              onClick={() => onRemove(tg)}
              className="rounded-full p-0.5 hover:text-destructive"
            >
              <X className="size-2.5" />
            </button>
          )}
        </span>
      ))}
      {adding ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={submit}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") {
              setDraft("");
              setAdding(false);
            }
          }}
          placeholder={t("tags.placeholder")}
          className="w-20 rounded-full border border-border bg-background px-2 py-0.5 font-mono text-[0.65rem] outline-none focus:border-primary/50"
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="rounded-full border border-dashed border-border px-2 py-0.5 font-mono text-[0.65rem] text-muted-foreground hover:border-primary/50 hover:text-foreground"
        >
          {addLabel ?? t("tags.add")}
        </button>
      )}
    </div>
  );
}
