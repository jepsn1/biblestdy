/** Reader look (#45): Paper = warm palette + Literata, Clean = neutral + sans.
 * Independent of light/dark. */
export const READER_STYLES = ['paper', 'clean'] as const
export type ReaderStyle = (typeof READER_STYLES)[number]

export function isReaderStyle(v: unknown): v is ReaderStyle {
  return typeof v === 'string' && (READER_STYLES as readonly string[]).includes(v)
}

/** Per-account preferences. null readerStyle = never chosen → onboarding chooser. */
export interface Preferences {
  readerStyle: ReaderStyle | null
}
