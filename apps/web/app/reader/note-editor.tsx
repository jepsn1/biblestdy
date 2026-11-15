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
import { useEffect, type Ref } from "react";
import { editorIcon } from "./editor-icons";

/**
 * The note body's WYSIWYG markdown editor (MDXEditor / Lexical) — its own
 * chunk (M8): ~270KB gz that most reading sessions never need. Load it via
 * `noteEditor` (note-editor-loader.ts), which sets up the Prism global first.
 */
export function NoteEditor({
  editorRef,
  markdown,
  onChange,
  onReady,
  placeholder,
  dark,
  mobile,
}: {
  editorRef: Ref<MDXEditorMethods>;
  markdown: string;
  onChange: (markdown: string) => void;
  /** After mount: the panel can hand focus over now. */
  onReady?: () => void;
  placeholder: string;
  dark: boolean;
  mobile: boolean;
}) {
  useEffect(() => {
    onReady?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on mount
  }, []);
  return (
    <MDXEditor
      ref={editorRef}
      iconComponentFor={editorIcon}
      markdown={markdown}
      onChange={onChange}
      placeholder={placeholder}
      className={`min-h-0 flex-1 overflow-y-auto ${dark ? "dark-theme" : ""}`}
      contentEditableClassName="font-serif text-control leading-relaxed [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-primary/40 [&_blockquote]:pl-3 [&_blockquote]:italic [&_h1]:mb-2 [&_h1]:text-title [&_h1]:font-medium [&_h2]:mb-1.5 [&_h2]:text-title [&_h2]:font-medium [&_h3]:mb-1 [&_h3]:text-reading [&_h3]:font-medium [&_h4]:font-medium [&_hr]:my-3 [&_hr]:border-border [&_li]:mb-0.5 [&_ol]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-2 [&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-5"
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
}
