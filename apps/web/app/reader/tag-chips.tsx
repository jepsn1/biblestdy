import { useTranslation } from "react-i18next";
import type { Tag } from "@biblestdy/shared";
import { X } from "lucide-react";
import { useRef, useState } from "react";
import { UndoInPlace } from "~/components/undo-in-place";
import { Link } from "react-router";
import { cn, focusField, focusRing } from "~/lib/utils";

/**
 * Tag chips + inline add box (issue #10). A chip links to its topic page;
 * chips with onRemove carry an ×. Enter adds, empty input blurs away.
 * A removed chip becomes "Removed · Undo" in its own place (#257) until
 * its time is up; Undo adds the topic back by name.
 */
export function TagChips({
  tags,
  onAdd,
  onRemove,
  addLabel,
}: {
  tags: Tag[];
  onAdd: (name: string) => void;
  /** Absent = chips are read-only links (e.g. note-derived topics).
   * Resolves true when removed (then the chip offers Undo in place). */
  onRemove?: (tag: Tag) => Promise<boolean>;
  addLabel?: string;
}) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  /** Removed chips, where they were: index in the list at removal. */
  const [gone, setGone] = useState<{ tag: Tag; at: number; focus: boolean }[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);

  async function remove(tag: Tag, at: number, focus: boolean) {
    if (!onRemove || !(await onRemove(tag))) return;
    setGone((g) => [...g.filter((x) => x.tag.id !== tag.id), { tag, at, focus }]);
  }
  function drop(id: string, hadFocus: boolean) {
    setGone((g) => g.filter((x) => x.tag.id !== id));
    // Focus was on its Undo: on to the next chip, else "+ add"
    if (hadFocus) {
      requestAnimationFrame(() => {
        const next = rootRef.current?.querySelector<HTMLElement>("[data-tag-chip] a, [data-tag-add]");
        next?.focus({ preventScroll: true });
      });
    }
  }
  // The live list with the removed chips back in their places
  const shown: ({ kind: "tag"; tag: Tag } | { kind: "gone"; tag: Tag; focus: boolean })[] = tags
    .filter((tg) => !gone.some((g) => g.tag.id === tg.id))
    .map((tag) => ({ kind: "tag" as const, tag }));
  for (const g of [...gone].sort((a, b) => a.at - b.at)) {
    if (tags.some((tg) => tg.id === g.tag.id)) continue; // already back
    shown.splice(Math.min(g.at, shown.length), 0, { kind: "gone", tag: g.tag, focus: g.focus });
  }

  function submit() {
    const name = draft.trim();
    if (name) onAdd(name);
    setDraft("");
    setAdding(false);
  }

  return (
    <div ref={rootRef} className="flex flex-wrap items-center gap-1.5">
      {shown.map((item, i) => {
        const tg = item.tag;
        if (item.kind === "gone")
          return (
            <UndoInPlace
              key={tg.id}
              label={t("notice.removed")}
              said={t("notice.tagRemoved", { name: tg.name })}
              focus={item.focus}
              className="py-0.5 text-meta"
              onUndo={() => {
                setGone((g) => g.filter((x) => x.tag.id !== tg.id));
                onAdd(tg.name);
              }}
              onGone={(hadFocus) => drop(tg.id, hadFocus)}
            />
          );
        return (
        <span
          key={tg.id}
          data-tag-chip=""
          className="flex items-center gap-1 rounded-full border border-border bg-muted/50 py-0.5 pr-1.5 pl-2 text-meta text-muted-foreground"
        >
          <Link
            to={`/notes?topic=${encodeURIComponent(tg.name)}`}
            title={t("tags.openTopic")}
            className="hover:text-primary"
          >
            {tg.name}
          </Link>
          {onRemove && (
            <button
              type="button"
              aria-label={t("tags.remove", { name: tg.name })}
              onClick={(e) => void remove(tg, i, e.currentTarget === document.activeElement)}
              // 24px hit area (WCAG 2.5.8) without growing the chip
              className={cn(
                "-my-1 -mr-1 inline-flex size-6 items-center justify-center rounded-full hover:text-destructive",
                focusRing,
              )}
            >
              <X className="size-2.5" />
            </button>
          )}
        </span>
        );
      })}
      {adding ? (
        <input
          // eslint-disable-next-line jsx-a11y/no-autofocus -- revealed by the user's "add tag" click; focus follows
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
          aria-label={t("tags.inputLabel")}
          className={cn(
            "w-20 rounded-full border border-border bg-background px-2 py-0.5 text-meta",
            focusField,
          )}
        />
      ) : (
        <button
          type="button"
          data-tag-add=""
          onClick={() => setAdding(true)}
          className="rounded-full border border-dashed border-border px-2 py-0.5 text-meta text-muted-foreground hover:border-primary/50 hover:text-foreground"
        >
          {addLabel ?? t("tags.add")}
        </button>
      )}
    </div>
  );
}
