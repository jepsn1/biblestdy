/**
 * MDXEditor's own UI strings in Danish (#160: "Paragraph" in the Danish UI).
 * Lives in the editor chunk, not the locale files: only an open note needs
 * them. English is MDXEditor's default text; `{{x}}` is interpolated.
 */
const DA: Record<string, string> = {
  "contentArea.editableMarkdown": "redigerbar tekst",
  "toolbar.blockTypeSelect.placeholder": "Bloktype",
  "toolbar.blockTypeSelect.selectBlockTypeTooltip": "Vælg bloktype",
  "toolbar.blockTypes.paragraph": "Afsnit",
  "toolbar.blockTypes.heading": "Overskrift {{level}}",
  "toolbar.blockTypes.quote": "Citat",
  "toolbar.undo": "Fortryd {{shortcut}}",
  "toolbar.redo": "Gentag {{shortcut}}",
  "toolbar.bold": "Fed",
  "toolbar.removeBold": "Fjern fed",
  "toolbar.italic": "Kursiv",
  "toolbar.removeItalic": "Fjern kursiv",
  "toolbar.underline": "Understreget",
  "toolbar.removeUnderline": "Fjern understregning",
  "toolbar.strikethrough": "Gennemstreget",
  "toolbar.removeStrikethrough": "Fjern gennemstregning",
  "toolbar.inlineCode": "Kode",
  "toolbar.removeInlineCode": "Fjern kode",
  "toolbar.bulletedList": "Punktopstilling",
  "toolbar.numberedList": "Nummereret liste",
  "toolbar.checkList": "Tjekliste",
  "toolbar.toggleGroup": "skifteknapper",
  "toolbar.link": "Indsæt link",
  "toolbar.table": "Indsæt tabel",
  "toolbar.thematicBreak": "Indsæt skillelinje",
  "toolbar.codeBlock": "Indsæt kodeblok",
  "createLink.url": "URL",
  "createLink.urlPlaceholder": "Vælg eller indsæt en URL",
  "createLink.text": "Linktekst",
  "createLink.textTooltip": "Teksten, linket vises med",
  "createLink.title": "Linkets titel",
  "createLink.titleTooltip": "Linkets titel, vist når man holder over det",
  "createLink.saveTooltip": "Gem URL",
  "createLink.cancelTooltip": "Annullér ændringen",
  "linkPreview.edit": "Redigér linkets URL",
  "linkPreview.remove": "Fjern link",
  "linkPreview.copyToClipboard": "Kopiér",
  "linkPreview.copied": "Kopieret!",
  "dialogControls.save": "Gem",
  "dialogControls.cancel": "Annullér",
  "dialog.close": "Luk dialog",
  "table.deleteTable": "Slet tabel",
  "table.columnMenu": "Kolonnemenu",
  "table.rowMenu": "Rækkemenu",
  "table.textAlignment": "Tekstjustering",
  "table.alignLeft": "Venstrestil",
  "table.alignCenter": "Centrér",
  "table.alignRight": "Højrestil",
  "table.insertColumnLeft": "Indsæt en kolonne til venstre",
  "table.insertColumnRight": "Indsæt en kolonne til højre",
  "table.insertRowAbove": "Indsæt en række over",
  "table.insertRowBelow": "Indsæt en række under",
  "table.deleteColumn": "Slet kolonnen",
  "table.deleteRow": "Slet rækken",
  "codeBlock.language": "Kodeblokkens sprog",
  "codeBlock.selectLanguage": "Vælg kodeblokkens sprog",
  "codeBlock.inlineLanguage": "Sprog",
  "codeblock.delete": "Slet kodeblok",
  // Ours: the format bar docked on the keyboard in the app (#273)
  "dock.label": "Formatering",
  "dock.hideKeyboard": "Skjul tastatur",
};

/** Names that carry a desktop shortcut ("Undo Ctrl+Z"): on a phone the
 * shortcut is noise to VoiceOver, and wrong on Apple keys (#273 panel). */
const SHORTCUT_IN_NAME = new Set(["toolbar.undo", "toolbar.redo"]);

/** MDXEditor's `translation` prop for a UI language; `touch`: no
 * keyboard shortcuts in the buttons' names. */
export function editorTranslation(language: string, touch = false) {
  const strings = language.startsWith("da") ? DA : null;
  return (key: string, defaultValue: string, interpolations: Record<string, unknown> = {}) => {
    let value = strings?.[key] ?? defaultValue;
    if (touch && SHORTCUT_IN_NAME.has(key)) return value.replace(/\s*\{\{shortcut\}\}/, "");
    for (const [k, v] of Object.entries(interpolations)) value = value.replaceAll(`{{${k}}}`, String(v));
    return value;
  };
}
