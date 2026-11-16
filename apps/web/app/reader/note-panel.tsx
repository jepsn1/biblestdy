import { useTranslation } from "react-i18next";
import type { Anchor, Note, NoteAnchor, ScriptureRef } from "@biblestdy/shared";
import { formatScriptureHref, scriptureLinkMarkdown, scriptureLinks } from "@biblestdy/shared";
import { usePanelRef } from "react-resizable-panels";
import { cn, focusTitle } from "~/lib/utils";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "~/components/ui/resizable";
import type { MDXEditorMethods } from "@mdxeditor/editor";
import { Check, Maximize2, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Hint, modKey } from "~/components/hint";
import { Popover, PopoverContent } from "~/components/ui/popover";
import type { EditorKit } from "./ref-context";
import type { VersePickerProps } from "./verse-picker";
import { bookLocale } from "~/lib/book-name";
import { chipLabel } from "~/lib/reference-label";
import { notifyError } from "~/lib/notify";
import { setOpenNote } from "~/lib/next-path";
import { clearDraft, draftDecision, readDraft, shouldKeepDraft, writeDraft } from "~/lib/note-drafts";
import { useIsDark } from "~/lib/theme";
import { PanelHeader } from "./panel-header";
import { INSERT_REF, INSERT_VERSE, SHOW_REF, type RefEventDetail } from "./dialog-events";
import type { ReferencesOverviewProps } from "./references-overview";
import { TagChips } from "./tag-chips";
import { noteEditor, referencesOverview } from "./note-editor-loader";
import { VERSE_FOCUS } from "./keyboard-selection";
import { LoadError } from "./marks-load-error";
import { useNoteTags } from "./use-tags";
import { lazyModule, preloadWhenIdle, useLazyModule } from "~/lib/lazy-module";
import { NoteTourHost, type TourKit } from "../notes/tour-host";

/** "+ Verse"'s dialog/drawer: its own chunk, fetched when idle. */
const versePicker = lazyModule(() => import("./verse-picker"));
function VersePicker(props: VersePickerProps) {
  useEffect(() => preloadWhenIdle(versePicker), []);
  const { value } = useLazyModule(versePicker, props.open);
  return value ? <value.VersePicker {...props} /> : null;
}

/** The references overview (#161), a chunk of its own; until it arrives a
 * blank heading-high strip holds its place. */
function ReferencesOverview(props: ReferencesOverviewProps) {
  const { value } = useLazyModule(referencesOverview);
  return value ? <value.ReferencesOverview {...props} /> : <div aria-hidden className="h-9" />;
}

/** What the editor chunk borrows from here (ref-context.ts: EditorKit). */
const EDITOR_KIT: EditorKit = { Popover, PopoverContent, Hint, modKey, VersePicker };
/** What the notes tours' chunk borrows from here (tour-host.tsx). */
export const TOUR_KIT: TourKit = { Popover, PopoverContent, Button };

/** Marks a control that opens a note (margin chip, phone marker): the side
 * panel takes focus from it and hands it back on close (#63). */
export const NOTE_OPENER = "data-note-opener";

/** The note's tags (issue #10) — own component so the query mounts per note. */
function NoteTagsRow({ noteId }: { noteId: string }) {
  const { t } = useTranslation();
  const { tags, failed, retry, add, remove } = useNoteTags(noteId);
  return (
    <>
      <TagChips
        tags={tags}
        onAdd={(name) => void add(name)}
        onRemove={(t) => void remove(t)}
      />
      {/* A failed load isn't "no topics" */}
      <LoadError failed={failed} message={t("note.topicsLoadFailed")} onRetry={retry} className="mt-1" />
    </>
  );
}

/**
 * Plain-text stand-in while the rich editor's chunk loads (M8): the note's
 * markdown in a real textarea, styled like the editor body — readable at
 * once and writable (the same body buffer, so autosave covers it). The
 * toolbar row is a placeholder. A failed load keeps it as a plain-text
 * editor and offers Retry (then Reload page — a deploy renames chunks).
 */
function FallbackEditor({
  ref,
  value,
  onChange,
  onActivity,
  onComposing,
  failed,
  onRetry,
  reload,
  mobile,
}: {
  ref: React.Ref<HTMLTextAreaElement>;
  value: string;
  onChange: (value: string) => void;
  /** Any input — the hand-over waits for a pause. */
  onActivity: () => void;
  onComposing: (composing: boolean) => void;
  failed: boolean;
  onRetry: () => void;
  /** Retried already: offer a page reload instead. */
  reload: boolean;
  mobile: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div aria-hidden className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-2">
        {Array.from({ length: mobile ? 3 : 6 }, (_, i) => (
          <span key={i} className="h-5 w-12 rounded bg-muted" />
        ))}
      </div>
      {failed ? (
        <p role="status" className="flex flex-wrap items-center gap-x-2 border-b border-border px-3 py-1.5 text-meta text-muted-foreground">
          {t("note.editorFailed")}
          <Button variant="link" size="sm" className="h-auto p-0 text-meta" onClick={onRetry}>
            {reload ? t("note.reloadPage") : t("note.retry")}
          </Button>
        </p>
      ) : (
        <span role="status" className="sr-only">
          {t("note.editorLoading")}
        </span>
      )}
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => {
          onActivity();
          onChange(e.target.value);
        }}
        onKeyDown={onActivity}
        onCompositionStart={() => onComposing(true)}
        onCompositionEnd={() => {
          onComposing(false);
          onActivity();
        }}
        placeholder={t("note.bodyPlaceholder")}
        aria-label={t("note.bodyLabel")}
        data-tour="note-body"
        className="min-h-0 flex-1 resize-none bg-transparent px-3 py-3 font-serif text-control leading-relaxed outline-none placeholder:text-muted-foreground"
      />
    </div>
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
 * The references overview at the bottom (#161, references-overview.tsx)
 * lists the references in the text, then the reader's selections; its pane
 * hugs its content (at most ~40%) until the reader drags the handle.
 */
export function NotePanel({
  note,
  onEdit,
  onRemove,
  onDetach,
  onAttach,
  onShowAnchor,
  onReadRef,
  selectedAnchorId,
  onClose,
  onOpenInNotes,
  page = false,
  mobile = false,
}: {
  note: Note;
  /** Resolves when the server saved; rejects on failure (save state). */
  onEdit: (id: string, patch: { title?: string; body?: string }) => Promise<unknown>;
  onRemove: (id: string) => void;
  /** Resolves to the updated note, or null when it failed. */
  onDetach: (id: string, anchorId: string) => Promise<unknown> | void;
  /** Puts a removed reader selection back (the overview's Undo). */
  onAttach?: (id: string, anchor: Anchor) => Promise<unknown>;
  onShowAnchor: (anchor: NoteAnchor) => void;
  /** Reads an inline reference (a chip's "Read here", its list row) — in
   * `translationId` when given ("Read in WEB"). */
  onReadRef?: (ref: ScriptureRef, translationId?: string) => void;
  /** Anchor id of the selected reference (spotlit in the reader). */
  selectedAnchorId: string | null;
  onClose: () => void;
  /** Reader panel: opens this note on the Notes page. */
  onOpenInNotes?: () => void;
  /** On the Notes page (not beside the text): Esc doesn't close it. */
  page?: boolean;
  /** Drawer build (#13): stacked layout, touch targets, slim toolbar —
   * feature parity with the desktop split, not a squeezed clone of it. */
  mobile?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const locale = bookLocale(i18n.language);
  // Unsaved text kept on this device (a failed save, an expired session's
  // trip to sign-in): reopening the note puts it back and autosave sends it
  const opened = useMemo(() => {
    const draft = readDraft(note.id);
    const decision = draftDecision(note, draft);
    return decision === "restore" && draft
      ? { title: draft.title, body: draft.body, decision }
      : { title: note.title, body: note.body, decision, draft };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per opened note
  }, [note.id]);
  const [title, setTitle] = useState(opened.title);
  const [body, setBody] = useState(opened.body);
  // Whose text the buffers hold: switching notes, they keep the previous
  // note's for a render — never to be saved or kept as this one's
  const [owner, setOwner] = useState(note.id);
  // The editor is uncontrolled: a restore it didn't start with remounts it
  const [editorKey, setEditorKey] = useState(0);
  // The live buffer — never the previous note's text during a switch
  const liveBody = owner === note.id ? body : opened.body;
  const dark = useIsDark();
  const titleRef = useRef<HTMLInputElement>(null);

  const editorRef = useRef<MDXEditorMethods>(null);
  // The editor is its own chunk (M8) — usually here already (idle preload)
  const { value: Editor, error: editorError, retry: retryEditor } = useLazyModule(noteEditor);
  const fallbackRef = useRef<HTMLTextAreaElement>(null);
  const focusBody = () =>
    editorRef.current?.focus(undefined, { defaultSelection: "rootEnd", preventScroll: true });
  const focusFallback = () => {
    const el = fallbackRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
  };
  // Plain textarea until the editor is here AND the writer pauses (~400ms,
  // no IME composition) — then the editor takes over with the live text
  const [handedOver, setHandedOver] = useState(() => !!noteEditor.peek());
  const lastInput = useRef(0);
  const composing = useRef(false);
  const focusOnReady = useRef(false);
  useEffect(() => {
    if (!Editor || handedOver) return;
    let timer = 0;
    const check = () => {
      const quiet = Date.now() - lastInput.current;
      if (composing.current || quiet < 400) {
        timer = window.setTimeout(check, composing.current ? 200 : 410 - quiet);
        return;
      }
      // Writing in the textarea: the editor gets the focus (caret at the end)
      focusOnReady.current = document.activeElement === fallbackRef.current;
      setHandedOver(true);
    };
    timer = window.setTimeout(check, 0);
    return () => window.clearTimeout(timer);
  }, [Editor, handedOver]);
  function onEditorReady() {
    if (!focusOnReady.current) return;
    focusOnReady.current = false;
    // The textarea is gone, so focus fell to <body>: move it on. Anything
    // the reader chose meanwhile keeps it.
    requestAnimationFrame(() => {
      const active = document.activeElement;
      if (!active || active === document.body) focusBody();
    });
  }
  // A failed editor download: Retry, then (a deploy renamed the chunk) a
  // page reload — after saving what's written
  const [editorRetries, setEditorRetries] = useState(0);
  function retryOrReload() {
    if (editorRetries === 0) {
      setEditorRetries(1);
      retryEditor();
      return;
    }
    const l = latest.current;
    const reload = () => window.location.reload();
    if (l.dirty) void saveRef.current(l.id, { title: l.title, body: l.body }).finally(reload);
    else reload();
  }

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
    // A blank note starts at its title; one with words, at the end of them
    const blank = !note.title && !note.body;
    if (!aside?.contains(document.activeElement))
      requestAnimationFrame(() => {
        if (blank) titleRef.current?.focus({ preventScroll: true });
        else if (editorRef.current) focusBody();
        // Editor chunk still loading: its plain-text stand-in, caret at the end
        else focusFallback();
      });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per opened note
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
      // Saved what's on screen: nothing left to keep
      const l = latest.current;
      if (l.id === id && l.title === patch.title && l.body === patch.body) clearDraft(id);
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
    setTitle(opened.title);
    setBody(opened.body);
    setOwner(note.id);
    setFailed(false);
    if (opened.decision === "restore") toast(t("note.draftRestored"), { id: `note-draft-${note.id}` });
    // Changed on another device since: offer, never overwrite
    const draft = opened.decision === "offer" ? opened.draft : null;
    if (draft) {
      toast(t("note.draftFound"), {
        id: `note-draft-${note.id}`,
        duration: 15_000,
        action: {
          label: t("note.draftRestore"),
          onClick: () => {
            setTitle(draft.title);
            setBody(draft.body);
            setEditorKey((k) => k + 1);
          },
        },
        // Only an explicit Discard drops it: ignored, it's offered next time
        cancel: { label: t("note.draftDiscard"), onClick: () => clearDraft(note.id) },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id]);

  // While unsaved, keep the text on this device too (sync, every change):
  // a full-page trip to sign-in runs no unmount flush
  useEffect(() => {
    if (shouldKeepDraft(owner, note, { title, body })) writeDraft(note.id, { title, body, base: note.updatedAt });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- note's fields listed
  }, [owner, note.id, note.title, note.body, note.updatedAt, title, body]);

  // An open reader note comes back after sign-in (?note=); the Notes page
  // has it in its path already
  useEffect(() => {
    if (page) return;
    setOpenNote(note.id);
    return () => setOpenNote(null);
  }, [note.id, page]);

  // Debounced autosave
  useEffect(() => {
    if (!shouldKeepDraft(owner, note, { title, body })) return;
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
  const tourRoot = useCallback(() => asideRef.current, []);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    const aside = asideRef.current;
    if (mobile || page || !aside) return;
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
  }, [mobile, page]);

  const status = failed ? "failed" : dirty || inFlight > 0 ? "saving" : "saved";

  // The overview's hands in the text (#161): the rich editor answers on this
  // panel's <aside> (ref-bridge.tsx); its plain-text stand-in is served here
  const editorLive = !!Editor && handedOver;
  const sendRef = (type: string, ref: ScriptureRef): boolean => {
    const href = formatScriptureHref(ref);
    if (!href) return false;
    const detail: RefEventDetail = { href, text: chipLabel(ref, locale).replace(/\u00a0/g, " "), done: false };
    asideRef.current?.dispatchEvent(new CustomEvent(type, { detail }));
    return detail.done;
  };
  /** Plain-text stand-in: the markdown goes in at its caret. */
  const insertPlain = (ref: ScriptureRef) => {
    const md = scriptureLinkMarkdown(ref, chipLabel(ref, locale).replace(/\u00a0/g, " "));
    const el = fallbackRef.current;
    if (!md) return;
    const at = el ? el.selectionEnd : liveBody.length;
    setBody(liveBody.slice(0, at) + md + liveBody.slice(at));
    requestAnimationFrame(() => {
      el?.focus({ preventScroll: true });
      el?.setSelectionRange(at + md.length, at + md.length);
    });
  };
  function showInText(ref: ScriptureRef): boolean {
    if (sendRef(SHOW_REF, ref)) return true;
    const href = formatScriptureHref(ref);
    const link = scriptureLinks(liveBody).find((l) => l.href === href);
    const el = fallbackRef.current;
    if (!link || !el) return false;
    el.focus({ preventScroll: true });
    el.setSelectionRange(link.start, link.end);
    return true;
  }
  /** `ref`: canonical numbers already (the overview maps them, #163). */
  function insertInText(ref: ScriptureRef) {
    if (!sendRef(INSERT_REF, ref)) insertPlain(ref);
  }
  // "+ Verse" in the overview: the toolbar button's dialog (verse-button),
  // or — editor not here yet — the same picker, into the stand-in
  const [picking, setPicking] = useState(false);
  function addVerse() {
    if (editorLive) window.dispatchEvent(new Event(INSERT_VERSE));
    else setPicking(true);
  }

  // Phone: while writing, the overview is one line; a tap opens it, typing
  // folds it again (Freja, Kasper)
  const [writing, setWriting] = useState(false);
  const [peek, setPeek] = useState(false);

  // Desktop: the overview's pane hugs its content, capped at 40% of the
  // split, until the reader drags the handle
  const refsPanel = usePanelRef();
  const groupEl = useRef<HTMLDivElement | null>(null);
  const userSized = useRef(false);
  const natural = useRef(0);
  const hug = useCallback(() => {
    const panel = refsPanel.current;
    const group = groupEl.current;
    if (!panel || !group || userSized.current || !natural.current) return;
    const px = Math.min(natural.current, group.clientHeight * 0.4);
    if (Math.abs(panel.getSize().inPixels - px) > 0.5) panel.resize(`${px}px`);
  }, [refsPanel]);
  const onNaturalHeight = useCallback(
    (px: number) => {
      natural.current = px;
      hug();
    },
    [hug],
  );
  useEffect(() => {
    const group = groupEl.current;
    if (mobile || !group) return;
    const ro = new ResizeObserver(hug);
    ro.observe(group);
    return () => ro.disconnect();
  }, [mobile, hug]);

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
            "min-w-0 flex-1 bg-transparent font-serif text-title font-medium placeholder:text-muted-foreground",
            focusTitle,
          )}
        />
        {onOpenInNotes && (
          <Hint label={t("note.openInNotes")}>
            <Button
              variant="ghost"
              size={mobile ? "icon" : "icon-sm"}
              aria-label={t("note.openInNotes")}
              onClick={onOpenInNotes}
              className="ml-1 text-muted-foreground"
            >
              <Maximize2 />
            </Button>
          </Hint>
        )}
      </PanelHeader>

      {/* Tags group study across the graph (issue #10) — chips open topic pages */}
      <div className="border-b border-border px-3 py-1.5">
        <NoteTagsRow noteId={note.id} />
      </div>

      {(() => {
        const editor = Editor && handedOver ? (
          <Editor.NoteEditor
            key={`${note.id}:${editorKey}`}
            editorRef={editorRef}
            // The live buffer: whatever was typed in the stand-in comes along
            markdown={liveBody}
            onChange={setBody}
            onReady={onEditorReady}
            onReadRef={onReadRef}
            kit={EDITOR_KIT}
            placeholder={t("note.bodyPlaceholder")}
            dark={dark}
            mobile={mobile}
          />
        ) : (
          <FallbackEditor
            ref={fallbackRef}
            value={liveBody}
            onChange={setBody}
            onActivity={() => {
              lastInput.current = Date.now();
            }}
            onComposing={(c) => {
              composing.current = c;
            }}
            failed={!!editorError}
            onRetry={retryOrReload}
            reload={editorRetries > 0}
            mobile={mobile}
          />
        );
        const references = (
          <ReferencesOverview
            note={note}
            body={liveBody}
            onReadRef={onReadRef}
            selectedAnchorId={selectedAnchorId}
            onShowAnchor={onShowAnchor}
            onDetach={onDetach}
            onAttach={onAttach}
            onAddVerse={addVerse}
            onShowInText={showInText}
            onInsertInText={insertInText}
            collapsed={mobile && writing && !peek}
            onExpand={() => setPeek(true)}
            onNaturalHeight={mobile ? undefined : onNaturalHeight}
            mobile={mobile}
          />
        );
        return mobile ? (
          // Stacked: editor breathes, references capped below it
          <div className="flex min-h-0 flex-1 flex-col">
            {/* Listens only: focus in/out, keys typed inside the editor */}
            {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
            <div
              data-tour="note-editor"
              className="flex min-h-0 flex-1 flex-col"
              onFocus={() => setWriting(true)}
              onBlur={(e) => {
                if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
                setWriting(false);
                setPeek(false);
              }}
              onKeyDown={() => setPeek(false)}
            >
              {editor}
            </div>
            <div data-tour="note-refs" className="flex max-h-[40%] shrink-0 flex-col border-t border-border">{references}</div>
          </div>
        ) : (
          <ResizablePanelGroup
            orientation="vertical"
            className="min-h-0 flex-1"
            elementRef={groupEl}
            onLayoutChanged={(_, meta) => {
              if (meta.isUserInteraction) userSized.current = true;
            }}
          >
            <ResizablePanel
              id="editor"
              data-tour="note-editor"
              defaultSize="72%"
              minSize="30%"
              className="flex min-h-0 flex-col"
            >
              {editor}
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel id="references" data-tour="note-refs" panelRef={refsPanel} defaultSize="28%" minSize="44px" maxSize="60%">
              {references}
            </ResizablePanel>
          </ResizablePanelGroup>
        );
      })()}

      {/* The note tour (#162): its code arrives only when it will show */}
      <NoteTourHost root={tourRoot} body={liveBody} kit={TOUR_KIT} />

      {picking && (
        <VersePicker
          open
          mobile={mobile}
          onClose={(ref) => {
            setPicking(false);
            if (ref) insertPlain(ref);
          }}
        />
      )}

      <footer className="flex items-center justify-between gap-2 border-t border-border py-1 pr-3 pl-1 text-meta text-muted-foreground">
        {/* No confirm: the delete toast offers Undo (#64) */}
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-destructive max-sm:h-10"
          onClick={() => {
            latest.current.dirty = false; // nothing to flush into a deleted note
            clearDraft(note.id);
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
              className="h-auto p-0 text-meta"
              onClick={() => void save(note.id, { title, body })}
            >
              {t("note.retry")}
            </Button>
          )}
          {!mobile && !page && <span className="pointer-coarse:hidden">· {t("note.escCloses")}</span>}
        </span>
      </footer>
    </aside>
  );
}
