export { healthStatus, type HealthStatus } from './health.js'
export {
  BOOKS,
  findBook,
  getBook,
  bookIndex,
  bookName,
  suggestBooks,
  type Book,
  type BookId,
  type BookSuggestion,
} from './books.js'
export { DANISH_BOOKS, type BookLocale } from './book-names.js'
export { parseReference, formatReference, compareReferences, type Reference } from './reference.js'
export type { Translation, Verse, Section, Chapter, TextBlock } from './scripture.js'
export {
  words,
  buildAnchor,
  wordRangeInVerse,
  sameAnchor,
  payloadAnchor,
  anchorReference,
  HIGHLIGHT_COLORS,
  DEFAULT_HIGHLIGHT_COLOR,
  isHighlightColor,
  type Anchor,
  type WordPos,
  type Highlight,
  type NewHighlight,
  type HighlightColor,
  type Annotation,
  type AnnotationMark,
  type NewAnnotation,
  type Note,
  type NoteAnchor,
  type NoteRef,
  type NoteRefOrigin,
  type NewNote,
} from './anchor.js'
export type { ChapterConnections } from './connections.js'
export type { Tag } from './tags.js'
export {
  READER_STYLES,
  isReaderStyle,
  type ReaderStyle,
  TEXT_SIZES,
  DEFAULT_TEXT_SIZE,
  isTextSize,
  type TextSize,
  type Preferences,
  type PreferencesPatch,
  type HighlightLabels,
  HIGHLIGHT_LABEL_MAX,
  parseHighlightLabels,
} from './preferences.js'
export { TRANSLATION_INFO, translationInfo, type TranslationInfo } from './translation-info.js'
export {
  SCRIPTURE_HREF_PREFIX,
  parseScriptureHref,
  formatScriptureHref,
  toScriptureRef,
  sameScriptureRef,
  scriptureLinks,
  refsInMarkdown,
  scriptureLinkMarkdown,
  refEndChapter,
  refTouchesChapter,
  type ScriptureRef,
  type ScriptureLink,
} from './scripture-href.js'
export {
  targetVerses,
  resolveInChapter,
  type VerseRange,
  type VerseUnit,
  type ChapterVerses,
  type ResolvedRange,
  type Resolution,
} from './scripture-resolve.js'
// Versification (#166): types only here. The functions + data live at
// '@biblestdy/shared/versification' so they stay out of the first-load bundle.
export type {
  Scheme,
  SliceKind,
  MappedSlice,
  Numbering,
  NumberingLike,
  Override,
  TargetUnits,
  SourceAnchor,
  UnionTarget,
} from './versification.js'
