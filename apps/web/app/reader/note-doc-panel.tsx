import type { FullNote } from "@biblestdy/shared";
import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  codeBlockPlugin,
  codeMirrorPlugin,
  CreateLink,
  headingsPlugin,
  InsertTable,
  InsertThematicBreak,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  ListsToggle,
  markdownShortcutPlugin,
  MDXEditor,
  quotePlugin,
  tablePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
  UndoRedo,
} from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { useIsDark } from "~/components/theme-toggle";

/**
 * Side-by-side editor for a full note (issue #7): title + WYSIWYG markdown
 * body (MDXEditor — markdown stays the DB format, users never have to see
 * syntax; toolbar + Obsidian-style markdown shortcuts + source-mode toggle).
 * Autosaves (debounced) — closing never loses work.
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
  const dark = useIsDark();

  // Fresh doc -> fresh buffers (the editor itself resets via key={doc.id})
  useEffect(() => {
    setTitle(doc.title);
    setBody(doc.body);
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
          // Keep password managers/autofill out of a document title
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          data-bwignore
          data-form-type="other"
          className="min-w-0 flex-1 bg-transparent font-serif text-xl font-medium outline-none placeholder:text-muted-foreground/60"
        />
        <button
          type="button"
          aria-label="Close note"
          onClick={onClose}
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </header>

      <MDXEditor
        key={doc.id}
        markdown={doc.body}
        onChange={setBody}
        placeholder="Write your note…"
        className={`min-h-0 flex-1 overflow-y-auto ${dark ? "dark-theme" : ""}`}
        contentEditableClassName="font-serif text-sm leading-relaxed [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-primary/40 [&_blockquote]:pl-3 [&_blockquote]:italic [&_h1]:mb-2 [&_h1]:text-2xl [&_h1]:font-medium [&_h2]:mb-1.5 [&_h2]:text-xl [&_h2]:font-medium [&_h3]:mb-1 [&_h3]:text-lg [&_h3]:font-medium [&_h4]:font-medium [&_hr]:my-3 [&_hr]:border-border [&_li]:mb-0.5 [&_ol]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-2 [&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-5"
        plugins={[
          headingsPlugin(),
          listsPlugin(),
          quotePlugin(),
          linkPlugin(),
          linkDialogPlugin(),
          tablePlugin(),
          thematicBreakPlugin(),
          codeBlockPlugin({ defaultCodeBlockLanguage: "" }),
          codeMirrorPlugin({ codeBlockLanguages: { "": "Plain", js: "JavaScript" } }),
          markdownShortcutPlugin(),
          toolbarPlugin({
            toolbarContents: () => (
              <>
                <UndoRedo />
                <BoldItalicUnderlineToggles />
                <BlockTypeSelect />
                <ListsToggle />
                <CreateLink />
                <InsertTable />
                <InsertThematicBreak />
              </>
            ),
          }),
        ]}
      />

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
        <span>{dirty ? "saving…" : "saved"} · esc closes</span>
      </footer>
    </aside>
  );
}
