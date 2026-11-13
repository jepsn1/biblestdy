import { useTranslation } from "react-i18next";
import type { Chapter, Note, NoteAnchor } from "@biblestdy/shared";
import { anchorReference, formatReference, words, wordRangeInVerse } from "@biblestdy/shared";
import { useQueries } from "@tanstack/react-query";
import { api } from "~/lib/query";
import { cn, focusRing } from "~/lib/utils";
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
  type MDXEditorMethods,
} from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";
import { Check, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { notifyError } from "~/lib/notify";
import { useIsDark } from "~/lib/theme";
import { PanelHeader } from "./panel-header";
import { TagChips } from "./tag-chips";
import { VERSE_FOCUS } from "./keyboard-selection";
import { useNoteTags } from "./use-tags";

/** Marks a control that opens a note (margin chip, phone marker): the side
 * panel takes focus from it and hands it back on close (#63). */
export const NOTE_OPENER = "data-note-opener";

/** The note's tags (issue #10) — own component so the query mounts per note. */
function NoteTagsRow({ noteId }: { noteId: string }) {
  const { tags, add, remove } = useNoteTags(noteId);
  return (
    <TagChips
      tags={tags}
      onAdd={(name) => void add(name)}
      onRemove={(t) => void remove(t)}
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
      <h3 className="mb-1 shrink-0 font-mono text-xs tracking-widest text-muted-foreground uppercase">
        {t("note.references")}
      </h3>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col">
        {note.anchors.map((a) => {
          const isSelected = a.id === selectedAnchorId;
          return (
          // Row = a real button (select / read there) + a sibling × — never
          // a button nested in a button
          <div
            key={a.id}
            className={`group grid grid-cols-[1fr_auto] items-center gap-x-1 rounded ${
              isSelected ? "bg-accent" : "hover:bg-accent/50"
            }`}
          >
            <button
              type="button"
              title={isSelected ? t("note.deselect") : t("note.readPassage")}
              aria-pressed={isSelected}
              onClick={() => onShowAnchor(a)}
              className={cn(
                "grid min-w-0 grid-cols-[auto_1fr] items-baseline gap-x-3 rounded px-1.5 text-left",
                mobile ? "py-2.5" : "py-1",
                focusRing,
              )}
            >
              <span className="font-mono text-xs whitespace-nowrap text-primary">
                {formatReference(anchorReference(a))}
              </span>
              <span className="truncate font-serif text-xs text-muted-foreground italic">
                {snippetOf(chapterOf.get(`${a.translationId}/${a.book}/${a.chapter}`), a)}
              </span>
            </button>
            {note.anchors.length > 1 ? (
              <button
                type="button"
                aria-label={t("note.removeReference")}
                title={t("note.removeReference")}
                onClick={() => onDetach(note.id, a.id)}
                className={cn(
                  "inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:text-destructive",
                  !mobile && "invisible group-focus-within:visible group-hover:visible",
                  focusRing,
                )}
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
 * Autosaves (debounced) — closing flushes a pending save, so it never loses
 * work. The footer's save state comes from the server (#64): "Saving…" until
 * the PATCH answers, "Saved ✓" after, "Not saved · Retry" (+ toast) on failure.
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
  /** Resolves when the server saved; rejects on failure (save state). */
  onEdit: (id: string, patch: { title?: string; body?: string }) => Promise<unknown>;
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
  const titleRef = useRef<HTMLInputElement>(null);

  const editorRef = useRef<MDXEditorMethods>(null);

  // Desktop side panel: focus moves to the note body on open (#65), ready to
  // write; closing returns it to what opened it — a note chip, or the verse
  // the note was made from (n / Create note). Drawers manage their own focus.
  // The opener is kept as a selector in a ref: a re-run (StrictMode, note
  // switch) finds focus already in the note, and the reader may re-create
  // the element meanwhile.
  const openerSel = useRef<string | null>(null);
  useEffect(() => {
    if (mobile) return;
    const active = document.activeElement;
    const chip = active?.closest<HTMLElement>(`[${NOTE_OPENER}]`);
    const verse = active?.closest<HTMLElement>(`[${VERSE_FOCUS}]`);
    if (chip) openerSel.current = `[${NOTE_OPENER}="${CSS.escape(chip.getAttribute(NOTE_OPENER) ?? "")}"]`;
    else if (verse) openerSel.current = `[${VERSE_FOCUS}="${verse.getAttribute(VERSE_FOCUS)}"]`;
    const aside = titleRef.current?.closest("aside");
    if (!aside?.contains(document.activeElement))
      requestAnimationFrame(() =>
        editorRef.current?.focus(undefined, { defaultSelection: "rootEnd", preventScroll: true }),
      );
    if (!openerSel.current) return;
    const sel = openerSel.current;
    return () => {
      const active = document.activeElement;
      if (active !== document.body && !aside?.contains(active)) return;
      // By id, not element: the reader re-lays out without the panel and the
      // ink re-measures (~340ms) — the chip may be re-created meanwhile
      const refocus = () => {
        if (!document.activeElement || document.activeElement === document.body)
          document.querySelector<HTMLElement>(sel)?.focus({ preventScroll: true });
      };
      requestAnimationFrame(refocus);
      window.setTimeout(refocus, 450);
    };
  }, [mobile, note.id]);

  /** In-flight PATCHes, and whether the last one failed. */
  const [inFlight, setInFlight] = useState(0);
  const [failed, setFailed] = useState(false);
  const dirty = title !== note.title || body !== note.body;

  // Latest buffers + save for the unmount flush and the Retry action
  const latest = useRef({ id: note.id, title, body, dirty });
  useEffect(() => {
    latest.current = { id: note.id, title, body, dirty };
  });

  async function save(id: string, patch: { title: string; body: string }) {
    setInFlight((n) => n + 1);
    try {
      await onEdit(id, patch);
      setFailed(false);
      toast.dismiss(`note-save-${id}`);
    } catch (e) {
      setFailed(true);
      notifyError(e, {
        id: `note-save-${id}`,
        retry: () => {
          const l = latest.current;
          if (l.id === id) void save(id, { title: l.title, body: l.body });
        },
      });
    } finally {
      setInFlight((n) => n - 1);
    }
  }
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });

  // Fresh note -> fresh buffers (the editor itself resets via key={note.id})
  useEffect(() => {
    setTitle(note.title);
    setBody(note.body);
    setFailed(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id]);

  // Debounced autosave
  useEffect(() => {
    if (title === note.title && body === note.body) return;
    const timer = setTimeout(() => void save(note.id, { title, body }), 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, body]);

  // Closing (or switching notes) with a save still pending: flush it now
  useEffect(
    () => () => {
      const l = latest.current;
      if (l.dirty) void saveRef.current(l.id, { title: l.title, body: l.body });
    },
    [note.id],
  );

  // Keys inside the panel (#65): Esc closes it — not when something in it
  // already used the Esc (an editor popup, the tag input); ⌘/Ctrl+Enter
  // closes from anywhere in it, the editor included. Drawers own their Esc.
  const asideRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    const aside = asideRef.current;
    if (mobile || !aside) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      const closeKey =
        (e.key === "Escape" && !(e.target as HTMLElement | null)?.closest?.("[role=dialog], [role=listbox], [role=menu]")) ||
        (e.key === "Enter" && (e.metaKey || e.ctrlKey));
      if (!closeKey) return;
      e.preventDefault();
      onCloseRef.current();
    };
    aside.addEventListener("keydown", onKey);
    return () => aside.removeEventListener("keydown", onKey);
  }, [mobile]);

  const status = failed ? "failed" : dirty || inFlight > 0 ? "saving" : "saved";

  return (
    <aside ref={asideRef} className="flex h-full w-full flex-col bg-background">
      {/* Panel heading (h2; its sections are h3) — the visible title is the input */}
      <h2 className="sr-only">{title || t("note.untitled")}</h2>
      <PanelHeader onClose={onClose} closeLabel={t("note.close")} className="pl-3">
        <input
          ref={titleRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("note.titlePlaceholder")}
          // Keep password managers/autofill out of a document title
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          data-bwignore
          data-form-type="other"
          aria-label={t("note.titleLabel")}
          className={cn(
            "min-w-0 flex-1 rounded-sm bg-transparent font-serif text-xl font-medium placeholder:text-muted-foreground",
            focusRing,
          )}
        />
      </PanelHeader>

      {/* Tags group study across the graph (issue #10) — chips open topic pages */}
      <div className="border-b border-border px-3 py-1.5">
        <NoteTagsRow noteId={note.id} />
      </div>

      {(() => {
        const editor = (
      <MDXEditor
        ref={editorRef}
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

      <footer className="flex items-center justify-between gap-2 border-t border-border py-1 pr-3 pl-1 text-xs text-muted-foreground">
        {/* No confirm: the delete toast offers Undo (#64) */}
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-destructive max-sm:h-10"
          onClick={() => {
            latest.current.dirty = false; // nothing to flush into a deleted note
            onRemove(note.id);
            onClose();
          }}
        >
          <Trash2 />
          {t("note.deleteNote")}
        </Button>
        <span className="flex items-center gap-1.5">
          {/* Not a live region: it flips on every keystroke. A failed save
              is announced by its toast. */}
          <span className="flex items-center gap-1">
            {status === "failed" ? (
              <span className="text-destructive">{t("note.notSaved")}</span>
            ) : status === "saving" ? (
              t("note.saving")
            ) : (
              <>
                <Check className="size-3.5" aria-hidden />
                {t("note.saved")}
              </>
            )}
          </span>
          {status === "failed" && (
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs"
              onClick={() => void save(note.id, { title, body })}
            >
              {t("note.retry")}
            </Button>
          )}
          {!mobile && <span className="font-mono">· {t("note.escCloses")}</span>}
        </span>
      </footer>
    </aside>
  );
}
