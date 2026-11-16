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
  type MDXEditorMethods,
} from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";
import type { ScriptureRef } from "@biblestdy/shared";
import { useEffect, useMemo, type Ref } from "react";
import { useTranslation } from "react-i18next";
import { editorIcon } from "./editor-icons";
import { editorTranslation } from "./editor-strings";
import { ScriptureRefContext, type EditorKit } from "./ref-context";
import { scriptureRefPlugin } from "./scripture-ref-node";
import { VerseButton } from "./verse-button";

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
}: {
  editorRef: Ref<MDXEditorMethods>;
  markdown: string;
  onChange: (markdown: string) => void;
  /** After mount: the panel can hand focus over now. */
  onReady?: () => void;
  placeholder: string;
  dark: boolean;
  mobile: boolean;
  /** A chip's "Read here" (in another translation for "Read in WEB"). */
  onReadRef?: (ref: ScriptureRef, translationId?: string) => void;
  /** Dialogs, popovers, tooltips — from the panel (see EditorKit). */
  kit: EditorKit;
}) {
  const { i18n } = useTranslation();
  const translation = useMemo(() => editorTranslation(i18n.language), [i18n.language]);
  const refs = useMemo(() => ({ onRead: onReadRef, mobile, kit }), [onReadRef, mobile, kit]);
  useEffect(() => {
    onReady?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on mount
  }, []);
  return (
    // The chips' popovers reach "Read here" through this (decorators render
    // inside the editor's React tree)
    <ScriptureRefContext value={refs}>
    <MDXEditor
      ref={editorRef}
      iconComponentFor={editorIcon}
      markdown={markdown}
      onChange={onChange}
      placeholder={placeholder}
      translation={translation}
      // relative: the `@` menu is placed inside this scroll box
      className={`relative min-h-0 flex-1 overflow-y-auto ${dark ? "dark-theme" : ""}`}
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
          toolbarContents: () =>
            mobile ? (
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
    </ScriptureRefContext>
  );
}
