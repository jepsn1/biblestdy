import type { FullNote } from "@biblestdy/shared";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";

/**
 * Side-by-side editor for a full note (issue #7): title + markdown body with
 * a write/preview toggle. Autosaves (debounced) — closing never loses work.
 */
export function NoteDocPanel({
  doc,
  onEdit,
  onRemove,
  onClose,
}: {
  doc: FullNote;
  onEdit: (id: string, patch: { title?: string; body?: string }) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(doc.title);
  const [body, setBody] = useState(doc.body);
  const [tab, setTab] = useState<"write" | "preview">("write");

  // Fresh doc -> fresh buffers
  useEffect(() => {
    setTitle(doc.title);
    setBody(doc.body);
    setTab("write");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id]);

  // Debounced autosave
  useEffect(() => {
    if (title === doc.title && body === doc.body) return;
    const t = setTimeout(() => onEdit(doc.id, { title, body }), 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, body]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const dirty = title !== doc.title || body !== doc.body;

  return (
    <aside className="flex h-full w-full flex-col bg-background">
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Untitled note"
          className="min-w-0 flex-1 bg-transparent font-serif text-base font-medium outline-none placeholder:text-muted-foreground/60"
        />
        <div className="flex rounded border border-border font-mono text-[0.65rem]">
          {(["write", "preview"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-2 py-0.5 ${tab === t ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t}
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-label="Close note"
          onClick={onClose}
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </header>

      {tab === "write" ? (
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write in markdown…"
          className="min-h-0 flex-1 resize-none bg-transparent p-3 font-serif text-sm leading-relaxed outline-none"
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-3 font-serif text-sm leading-relaxed [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-primary/40 [&_blockquote]:pl-3 [&_blockquote]:italic [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.85em] [&_h1]:mb-2 [&_h1]:text-xl [&_h1]:font-medium [&_h2]:mb-1.5 [&_h2]:text-lg [&_h2]:font-medium [&_h3]:font-medium [&_hr]:my-3 [&_hr]:border-border [&_li]:mb-0.5 [&_ol]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-2 [&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-5">
          <ReactMarkdown>{body || "*Nothing here yet.*"}</ReactMarkdown>
        </div>
      )}

      <footer className="flex items-center justify-between border-t border-border px-3 py-1.5 font-mono text-[0.6rem] text-muted-foreground">
        <button
          type="button"
          className="hover:text-destructive"
          onClick={() => {
            onRemove(doc.id);
            onClose();
          }}
        >
          delete
        </button>
        <span>{dirty ? "saving…" : "saved"} · markdown · esc closes</span>
      </footer>
    </aside>
  );
}
