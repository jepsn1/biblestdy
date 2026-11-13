/** Reader look (#45): Paper = warm palette + Literata, Clean = neutral + sans.
 * Independent of light/dark. */
export const READER_STYLES = ['paper', 'clean'] as const
export type ReaderStyle = (typeof READER_STYLES)[number]

export function isReaderStyle(v: unknown): v is ReaderStyle {
  return typeof v === 'string' && (READER_STYLES as readonly string[]).includes(v)
}

/** In-app text size (#61), percent of the root font size. Scales reading text
 * AND chrome (everything is rem-based); 200% meets WCAG 1.4.4 with the
 * viewport zoom lock kept. */
export const TEXT_SIZES = [100, 125, 150, 175, 200] as const
export type TextSize = (typeof TEXT_SIZES)[number]
export const DEFAULT_TEXT_SIZE: TextSize = 100

export function isTextSize(v: unknown): v is TextSize {
  return typeof v === 'number' && (TEXT_SIZES as readonly number[]).includes(v)
}

/** Per-account preferences. null readerStyle = never chosen → onboarding
 * chooser; null textSize = never changed → 100%. */
export interface Preferences {
  readerStyle: ReaderStyle | null
  textSize: TextSize | null
}

/** PATCH /api/preferences body: any subset, at least one field. */
export type PreferencesPatch = Partial<{
  readerStyle: ReaderStyle
  textSize: TextSize
}>
