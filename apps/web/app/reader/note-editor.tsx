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
  Separator,
  tablePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
  UndoRedo,
  useTranslation as useEditorTranslation,
  type MDXEditorMethods,
} from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";
import type { NoteRef } from "@biblestdy/shared";
import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useRef, type Ref } from "react";
import { useTranslation } from "react-i18next";
import { isNativeShell } from "~/lib/api-base";
import { caretDelta, KEYBOARD_MS } from "~/lib/keyboard-native";
import { hideKeyboard, lightTap } from "~/lib/native-touch";
import { editorIcon } from "./editor-icons";
import { editorTranslation } from "./editor-strings";
import { ScriptureRefContext, type EditorKit, type PagePlace, type ReadRef } from "./ref-context";
import { scriptureRefPlugin } from "./scripture-ref-node";
import { VerseButton } from "./verse-button";

/**
 * A tap in the empty space under the last line (the editable fills the
 * note's area, app.css, #262) puts the caret at the very end, as a notes app
 * does — not on the last line at the tap's x. Synchronous, inside the tap:
 * iOS keeps the keyboard only for a focus/selection made in the gesture, and
 * Lexical takes the DOM selection from selectionchange (Jonas F2).
 */
function caretToEnd(e: React.PointerEvent) {
  const root = e.target as HTMLElement;
  if (root.getAttribute("contenteditable") !== "true") return; // a line, a chip, a toolbar
  const last = root.lastElementChild;
  if (!last || e.clientY <= last.getBoundingClientRect().bottom) return;
  const walk = document.createTreeWalker(last, NodeFilter.SHOW_TEXT);
  let text: Node | null = null;
  for (let n = walk.nextNode(); n; n = walk.nextNode()) text = n;
  const range = document.createRange();
  if (text) range.setStart(text, text.textContent?.length ?? 0);
  else range.selectNodeContents(last);
  range.collapse(!!text);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

/** The format bar's buttons (#273): a tap keeps the keyboard up — no
 * focus move, so iOS doesn't drop it with the editor's focus — and, in the
 * app, ticks under the finger. */
function keepFocus(e: React.MouseEvent) {
  if ((e.target as Element).closest(".note-dock button")) e.preventDefault();
}
function tick(e: React.MouseEvent) {
  const button = (e.target as Element).closest<HTMLButtonElement>(".note-dock button");
  if (button && !button.disabled && !button.hasAttribute("data-hide-keyboard")) lightTap();
}

/** The caret shows above the docked bar once the keyboard is up (#273):
 * nothing scrolls it there by itself when the writing area shrinks under
 * it (Lexical only does as you type). */
function revealCaret(box: HTMLElement | null) {
  const sel = window.getSelection();
  if (!box || !sel?.rangeCount || !box.contains(sel.anchorNode)) return;
  const rects = sel.getRangeAt(0).getClientRects();
  // A caret on an empty line has no rect of its own: its line's
  const node = sel.anchorNode;
  const line = node instanceof Element ? node : node?.parentElement;
  const r = rects.length ? rects[rects.length - 1] : line && line !== box ? line.getBoundingClientRect() : null;
  if (!r) return;
  const d = caretDelta(r, box.getBoundingClientRect());
  if (d) box.scrollTop += d;
}

/** Last in the docked bar, held at its end: the keyboard goes away (the
 * accessory bar's ✓ that the app hides, #256). */
function HideKeyboard() {
  const t = useEditorTranslation();
  return (
    <button type="button" data-hide-keyboard="" aria-label={t("dock.hideKeyboard", "Hide keyboard")} onClick={hideKeyboard}>
      <ChevronDown aria-hidden className="size-4" />
    </button>
  );
}

/**
 * The note body's WYSIWYG markdown editor (MDXEditor / Lexical) — its own
 * chunk (M8): ~270KB gz that most reading sessions never need. Load it via
 * `noteEditor` (note-editor-loader.ts), which sets up the Prism global first.
 * Inline scripture references (#160) live here too: the chip node, the `@`
 * typeahead and the "+ Verse" button — all in this chunk.
 */
export function NoteEditor({
  editorRef,
  markdown,
  onChange,
  onReady,
  placeholder,
  dark,
  mobile,
  onReadRef,
  kit,
  page,
  noteRefs,
}: {
  editorRef: Ref<MDXEditorMethods>;
  markdown: string;
  onChange: (markdown: string) => void;
  /** After mount: the panel can hand focus over now. */
  onReady?: () => void;
  placeholder: string;
  dark: boolean;
  mobile: boolean;
  /** A chip's "Show in Bible" (in another translation for "Read in WEB"). */
  onReadRef?: ReadRef;
  /** Dialogs, popovers, tooltips — from the panel (see EditorKit). */
  kit: EditorKit;
  /** The chapter open in the reader beside the note (#191). */
  page?: PagePlace;
  /** The note's saved refs: where tagged chips' marks live (#216). */
  noteRefs?: readonly NoteRef[];
}) {
  const { i18n } = useTranslation();
  const translation = useMemo(() => editorTranslation(i18n.language), [i18n.language]);
  const pageTid = page?.translationId;
  const pageBook = page?.book;
  const pageCh = page?.chapter;
  // Phones in the app (#273): the format bar docks on the keyboard and is
  // there only while writing; the web keeps it above the text
  const dock = mobile && isNativeShell();
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    const box = wrap.current?.querySelector<HTMLElement>('.mdxeditor-root-contenteditable [contenteditable="true"]');
    if (!dock || !vv || !box) return;
    box.closest(".mdxeditor")?.querySelector(".note-dock")?.setAttribute("aria-label", translation("dock.label", "Formatting"));
    let timer = 0;
    const settle = () => {
      window.clearTimeout(timer);
      // After the sheet has fitted itself to the keyboard (its slide)
      timer = window.setTimeout(() => revealCaret(box), KEYBOARD_MS + 30);
    };
    vv.addEventListener("resize", settle);
    return () => {
      window.clearTimeout(timer);
      vv.removeEventListener("resize", settle);
    };
  }, [dock, translation]);
  const refs = useMemo(
    () => ({
      onRead: onReadRef,
      mobile,
      kit,
      page: pageTid && pageBook && pageCh ? { translationId: pageTid, book: pageBook, chapter: pageCh } : undefined,
      noteRefs,
    }),
    [onReadRef, mobile, kit, pageTid, pageBook, pageCh, noteRefs],
  );
  useEffect(() => {
    onReady?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on mount
  }, []);
  return (
    // The chips' popovers reach "Read here" through this (decorators render
    // inside the editor's React tree)
    <ScriptureRefContext value={refs}>
    {/* contents: no box of its own, the editor's layout is unchanged */}
    {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- listens only: the bar's buttons are the controls */}
    <div ref={wrap} className="contents" onPointerUp={caretToEnd} onMouseDown={dock ? keepFocus : undefined} onClick={dock ? tick : undefined}>
    <MDXEditor
      ref={editorRef}
      iconComponentFor={editorIcon}
      markdown={markdown}
      onChange={onChange}
      placeholder={placeholder}
      translation={translation}
      // relative: the `@` menu's place outside a note panel (ref-typeahead)
      className={`relative min-h-0 flex-1 ${dock ? "note-docked" : "overflow-y-auto"} ${dark ? "dark-theme" : ""}`}
      contentEditableClassName="font-serif text-control leading-relaxed [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-primary/40 [&_blockquote]:pl-3 [&_blockquote]:italic [&_h1]:mb-2 [&_h1]:text-title [&_h1]:font-medium [&_h2]:mb-1.5 [&_h2]:text-title [&_h2]:font-medium [&_h3]:mb-1 [&_h3]:text-reading [&_h3]:font-medium [&_h4]:font-medium [&_hr]:my-3 [&_hr]:border-border [&_li]:mb-0.5 [&_ol]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-2 [&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-5"
      plugins={[
        headingsPlugin(),
        listsPlugin(),
        quotePlugin(),
        // Before linkPlugin: `bible:` links become chips, not blanked links
        scriptureRefPlugin(),
        linkPlugin(),
        linkDialogPlugin(),
        tablePlugin(),
        thematicBreakPlugin(),
        codeBlockPlugin({ defaultCodeBlockLanguage: "" }),
        codeMirrorPlugin({ codeBlockLanguages: { "": "Plain", js: "JavaScript" } }),
        markdownShortcutPlugin(),
        toolbarPlugin({
          toolbarPosition: dock ? "bottom" : "top",
          toolbarClassName: dock ? "note-dock" : "",
          toolbarContents: () =>
            dock ? (
              // On the keyboard (#273 panel): writing first, nearest the
              // thumb; the way out of the keyboard held at the end
              <>
                <BoldItalicUnderlineToggles />
                <ListsToggle />
                <Separator />
                <VerseButton />
                <Separator />
                <UndoRedo />
                <HideKeyboard />
              </>
            ) : mobile ? (
              // Thumb-width toolbar: the essentials, one row
              <>
                <UndoRedo />
                <VerseButton />
                <Separator />
                <BoldItalicUnderlineToggles />
                <ListsToggle />
              </>
            ) : (
              <>
                <UndoRedo />
                <VerseButton />
                <Separator />
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
    </div>
    </ScriptureRefContext>
  );
}
