import { useTranslation } from "react-i18next";
import type { Note } from "@biblestdy/shared";
import { anchorReference, formatReference } from "@biblestdy/shared";
import { X } from "lucide-react";
import { useNavigate } from "react-router";
import { ScrollArea } from "~/components/ui/scroll-area";
import { TagChips } from "./tag-chips";
import { useConnections } from "./use-connections";
import { usePassageTags } from "./use-tags";

/**
 * The connections panel (issue #9) — resurfacing at the point of reading:
 * notes anchored in this chapter, the passages they also anchor to
 * ("also appears in"), and the most recent notes as re-entry into study.
 */
export function ConnectionsPanel({
  translationId,
  book,
  chapter,
  onOpenNote,
  onClose,
}: {
  translationId: string;
  book: string;
  chapter: number;
  onOpenNote: (id: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const connections = useConnections(translationId, book, chapter, true);
  const passageTags = usePassageTags(translationId, book, chapter);

  /** A note anchored here opens in place; one from elsewhere is read there,
   * arriving with its panel open (?note= survives navigation). */
  function openNote(note: Note) {
    const here = note.anchors.some(
      (a) => a.translationId === translationId && a.book === book && a.chapter === chapter,
    );
    if (here) {
      onOpenNote(note.id);
      return;
    }
    const a = note.anchors[0];
    if (a) navigate(`/read/${a.book}/${a.chapter}?note=${note.id}`);
  }

  function NoteRow({ note }: { note: Note }) {
    return (
      <button
        type="button"
        onClick={() => openNote(note)}
        className="w-full rounded px-2 py-1.5 text-left hover:bg-accent"
      >
        <span className="block truncate font-serif text-sm">
          {note.title || t("note.untitled")}
        </span>
        <span className="block truncate font-mono text-[0.6rem] text-muted-foreground">
          {note.anchors.map((a) => formatReference(anchorReference(a))).join(" · ")}
        </span>
      </button>
    );
  }

  function SectionTitle({ children }: { children: string }) {
    return (
      <h3 className="px-2 pb-1 font-sans text-[0.65rem] font-semibold tracking-widest text-primary/80 uppercase">
        {children}
      </h3>
    );
  }

  return (
    <aside className="flex h-full w-full flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="font-serif text-lg font-medium">{t("connections.title")}</span>
        <button
          type="button"
          aria-label={t("connections.close")}
          onClick={onClose}
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        {connections && (
          <div className="flex flex-col gap-5 p-2 pt-3">
            <section>
              <SectionTitle>{t("connections.topics")}</SectionTitle>
              {/* Union of this chapter's tags and its notes' tags; only tags
                  ON the passage are removable here — note tags live with the
                  note. Adding always tags the passage. */}
              <div className="px-2">
                <TagChips
                  tags={connections.topics.filter((tp) => tp.onPassage)}
                  onAdd={(name) => void passageTags.add(name)}
                  onRemove={(tp) => void passageTags.remove(tp.id)}
                  addLabel={t("connections.tagPassage")}
                />
                {connections.topics.some((tp) => !tp.onPassage) && (
                  <div className="mt-1.5">
                    <span className="font-mono text-[0.6rem] text-muted-foreground">
                      {t("connections.viaNotes")}{" "}
                    </span>
                    {connections.topics
                      .filter((tp) => !tp.onPassage)
                      .map((tp, i, arr) => (
                        <button
                          key={tp.id}
                          type="button"
                          onClick={() => navigate(`/topic/${encodeURIComponent(tp.name)}`)}
                          className="font-mono text-[0.6rem] text-muted-foreground underline-offset-2 hover:text-primary hover:underline"
                        >
                          {t.name}
                          {i < arr.length - 1 ? ", " : ""}
                        </button>
                      ))}
                  </div>
                )}
              </div>
            </section>

            <section>
              <SectionTitle>{t("connections.anchoredHere")}</SectionTitle>
              {connections.notesHere.length === 0 && (
                <p className="px-2 font-serif text-xs text-muted-foreground italic">
                  {t("connections.emptyAnchored")}
                </p>
              )}
              {connections.notesHere.map((n) => (
                <NoteRow key={n.id} note={n} />
              ))}
            </section>

            <section>
              <SectionTitle>{t("connections.alsoAppearsIn")}</SectionTitle>
              {connections.alsoAppearsIn.length === 0 && (
                <p className="px-2 font-serif text-xs text-muted-foreground italic">
                  {t("connections.emptyShared")}
                </p>
              )}
              {connections.alsoAppearsIn.map((p) => (
                <button
                  key={`${p.translationId}/${p.book}.${p.chapter}`}
                  type="button"
                  onClick={() => navigate(`/read/${p.book}/${p.chapter}`)}
                  className="w-full rounded px-2 py-1.5 text-left hover:bg-accent"
                >
                  <span className="block font-serif text-sm">
                    {formatReference({ book: p.book, chapter: p.chapter })}
                  </span>
                  <span className="block truncate font-mono text-[0.6rem] text-muted-foreground">
                    {t("connections.via")} {p.notes.map((n) => n.title || t("note.untitled")).join(", ")}
                  </span>
                </button>
              ))}
            </section>

            <section>
              <SectionTitle>{t("connections.recent")}</SectionTitle>
              {connections.recent.length === 0 && (
                <p className="px-2 font-serif text-xs text-muted-foreground italic">
                  {t("connections.emptyRecent")}
                </p>
              )}
              {connections.recent.map((n) => (
                <NoteRow key={n.id} note={n} />
              ))}
            </section>
          </div>
        )}
      </ScrollArea>
    </aside>
  );
}
