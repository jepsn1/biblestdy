import type { Note } from "@biblestdy/shared";
import { anchorReference, formatReference } from "@biblestdy/shared";
import { X } from "lucide-react";
import { useNavigate } from "react-router";
import { ScrollArea } from "~/components/ui/scroll-area";
import { useConnections } from "./use-connections";

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
  const navigate = useNavigate();
  const connections = useConnections(translationId, book, chapter, true);

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
          {note.title || "Untitled note"}
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
        <span className="font-serif text-lg font-medium">Connections</span>
        <button
          type="button"
          aria-label="Close connections"
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
              <SectionTitle>Anchored here</SectionTitle>
              {connections.notesHere.length === 0 && (
                <p className="px-2 font-serif text-xs text-muted-foreground italic">
                  No notes on this chapter yet — select words to begin.
                </p>
              )}
              {connections.notesHere.map((n) => (
                <NoteRow key={n.id} note={n} />
              ))}
            </section>

            <section>
              <SectionTitle>Also appears in</SectionTitle>
              {connections.alsoAppearsIn.length === 0 && (
                <p className="px-2 font-serif text-xs text-muted-foreground italic">
                  No shared passages yet — anchor a note in two places to
                  connect them.
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
                    via {p.notes.map((n) => n.title || "Untitled note").join(", ")}
                  </span>
                </button>
              ))}
            </section>

            <section>
              <SectionTitle>Recent notes</SectionTitle>
              {connections.recent.length === 0 && (
                <p className="px-2 font-serif text-xs text-muted-foreground italic">
                  Nothing yet.
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
