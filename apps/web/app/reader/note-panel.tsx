import { useTranslation } from "react-i18next";
import type { Chapter, Note, NoteAnchor } from "@biblestdy/shared";
import { anchorReference, formatReference, words, wordRangeInVerse } from "@biblestdy/shared";
import { useQueries } from "@tanstack/react-query";
import { api } from "~/lib/query";
import { ScrollArea } from "~/components/ui/scroll-area";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "~/components/ui/resizable";
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
import { TagChips } from "./tag-chips";
import { useNoteTags } from "./use-tags";

/** The note's tags (issue #10) — own component so the query mounts per note. */
function NoteTagsRow({ noteId }: { noteId: string }) {
  const { tags, add, remove } = useNoteTags(noteId);
  return (
    <TagChips
      tags={tags}
      onAdd={(name) => void add(name)}
      onRemove={(t) => void remove(t.id)}
    />
  );
}

/** The words an anchor covers, shortened for the references table. */
function snippetOf(chapter: Chapter | undefined, a: NoteAnchor): string {
  if (!chapter) return "";
  const covered: string[] = [];
  for (const v of chapter.verses) {
    const tokens = words(v.text);
    const r = wordRangeInVerse(a, v.verse, tokens.length);
    if (r) covered.push(...tokens.slice(r.start, r.end + 1));
  }
  const s = covered.join(" ");
  return s.length > 64 ? `${s.slice(0, 64).trimEnd()}…` : s;
}

/** Bottom section of the note view (issue on 2026-07-09: more blocks to come,
 * references first): every passage the note anchors to — reference, the
 * anchored words, unlink. Click a row to read there with the span flashed. */
function ReferencesTable({
  note,
  selectedAnchorId,
  onShowAnchor,
  onDetach,
  mobile = false,
}: {
  note: Note;
  selectedAnchorId: string | null;
  onShowAnchor: (anchor: NoteAnchor) => void;
  onDetach: (id: string, anchorId: string) => void;
  mobile?: boolean;
}) {
  const { t } = useTranslation();
  const chapterKeys = [
    ...new Map(
      note.anchors.map((a) => [`${a.translationId}/${a.book}/${a.chapter}`, a]),
    ).entries(),
  ];
  const results = useQueries({
    queries: chapterKeys.map(([, a]) => ({
      queryKey: ["chapter", a.translationId, a.book, a.chapter],
      queryFn: () =>
        api<Chapter>(`/api/passages/${a.translationId}/${a.book}/${a.chapter}`),
      staleTime: 60 * 60 * 1000, // scripture text is immutable, cache hard
    })),
  });
  const chapterOf = new Map(chapterKeys.map(([key], i) => [key, results[i].data]));

  return (
    <section className="flex h-full min-h-0 flex-col px-3 py-2">
      <h3 className="mb-1 shrink-0 font-mono text-[0.6rem] tracking-widest text-muted-foreground uppercase">
        {t("note.references")}
      </h3>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col">
        {note.anchors.map((a) => {
          const isSelected = a.id === selectedAnchorId;
          return (
          <div
            key={a.id}
            role="button"
            tabIndex={0}
            title={isSelected ? t("note.deselect") : t("note.readPassage")}
            aria-pressed={isSelected}
            onClick={() => onShowAnchor(a)}
            onKeyDown={(e) => e.key === "Enter" && onShowAnchor(a)}
            className={`group grid cursor-pointer grid-cols-[auto_1fr_auto] items-baseline gap-x-3 rounded px-1.5 ${
              mobile ? "py-2.5" : "py-1"
            } ${isSelected ? "bg-accent" : "hover:bg-accent/50"}`}
          >
            <span className="font-mono text-[0.65rem] whitespace-nowrap text-primary">
              {formatReference(anchorReference(a))}
            </span>
            <span className="truncate font-serif text-xs text-muted-foreground italic">
              {snippetOf(chapterOf.get(`${a.translationId}/${a.book}/${a.chapter}`), a)}
            </span>
            {note.anchors.length > 1 ? (
              <button
                type="button"
                aria-label={t("note.removeReference")}
                title={t("note.removeReference")}
                onClick={(e) => {
                  e.stopPropagation();
                  onDetach(note.id, a.id);
                }}
                className={`self-center text-muted-foreground hover:text-destructive ${
                  mobile ? "" : "invisible group-hover:visible"
                }`}
              >
                <X className="size-3" />
              </button>
            ) : (
              <span />
            )}
          </div>
          );
        })}
        </div>
      </ScrollArea>
    </section>
  );
}

/**
 * Side-by-side editor for a full note (issue #7): title + WYSIWYG markdown
 * body (MDXEditor — markdown stays the DB format, users never have to see
 * syntax; toolbar + Obsidian-style markdown shortcuts + source-mode toggle).
 * Autosaves (debounced) — closing never loses work.
 *
 * The references table at the bottom lists every passage the note anchors to
 * (issue #8): click reads there with the span flashed, × unlinks. The last
 * anchor is not removable — a note stays reachable from Scripture; deleting
 * the note is the way out.
 */
export function NotePanel({
  note,
  onEdit,
  onRemove,
  onDetach,
  onShowAnchor,
  selectedAnchorId,
  onClose,
  mobile = false,
}: {
  note: Note;
  onEdit: (id: string, patch: { title?: string; body?: string }) => void;
  onRemove: (id: string) => void;
  onDetach: (id: string, anchorId: string) => void;
  onShowAnchor: (anchor: NoteAnchor) => void;
  /** Anchor id of the selected reference (spotlit in the reader). */
  selectedAnchorId: string | null;
  onClose: () => void;
  /** Drawer build (#13): stacked layout, touch targets, slim toolbar —
   * feature parity with the desktop split, not a squeezed clone of it. */
  mobile?: boolean;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const dark = useIsDark();

  // Fresh note -> fresh buffers (the editor itself resets via key={note.id})
  useEffect(() => {
    setTitle(note.title);
    setBody(note.body);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id]);

  // Debounced autosave
  useEffect(() => {
    if (title === note.title && body === note.body) return;
    const timer = setTimeout(() => onEdit(note.id, { title, body }), 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, body]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const dirty = title !== note.title || body !== note.body;

  return (
    <aside className="flex h-full w-full flex-col bg-background">
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("note.titlePlaceholder")}
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
          aria-label={t("note.close")}
          onClick={onClose}
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </header>

      {/* Tags group study across the graph (issue #10) — chips open topic pages */}
      <div className="border-b border-border px-3 py-1.5">
        <NoteTagsRow noteId={note.id} />
      </div>

      {(() => {
        const editor = (
      <MDXEditor
        key={note.id}
        markdown={note.body}
        onChange={setBody}
        placeholder={t("note.bodyPlaceholder")}
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
            toolbarContents: () =>
              mobile ? (
                // Thumb-width toolbar: the essentials, one row
                <>
                  <UndoRedo />
                  <BoldItalicUnderlineToggles />
                  <ListsToggle />
                </>
              ) : (
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
        );
        const references = (
          <ReferencesTable
            note={note}
            selectedAnchorId={selectedAnchorId}
            onShowAnchor={onShowAnchor}
            onDetach={onDetach}
            mobile={mobile}
          />
        );
        return mobile ? (
          // Stacked: editor breathes, references capped below it
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1 flex-col">{editor}</div>
            <div className="max-h-[30%] shrink-0 border-t border-border">{references}</div>
          </div>
        ) : (
          <ResizablePanelGroup orientation="vertical" className="min-h-0 flex-1">
            <ResizablePanel
              id="editor"
              defaultSize="72%"
              minSize="30%"
              className="flex min-h-0 flex-col"
            >
              {editor}
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel id="references" defaultSize="28%" minSize="10%" maxSize="60%">
              {references}
            </ResizablePanel>
          </ResizablePanelGroup>
        );
      })()}

      <footer className="flex items-center justify-between border-t border-border px-3 py-1.5 font-mono text-[0.6rem] text-muted-foreground">
        <button
          type="button"
          className="hover:text-destructive"
          onClick={() => {
            onRemove(note.id);
            onClose();
          }}
        >
          {t("note.delete")}
        </button>
        <span>
          {dirty ? t("note.saving") : t("note.saved")}
          {!mobile && <> · {t("note.escCloses")}</>}
        </span>
      </footer>
    </aside>
  );
}
