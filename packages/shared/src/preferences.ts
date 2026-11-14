import { HIGHLIGHT_COLORS, type HighlightColor } from './anchor.js'

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

/** A reader's own names for the highlight colours ("blue" → "God speaking").
 * Only renamed colours are present: a missing one is called by its colour
 * name, in the UI language. */
export type HighlightLabels = Partial<Record<HighlightColor, string>>
export const HIGHLIGHT_LABEL_MAX = 30

/** A labels map from the wire, cleaned: whitespace trimmed/collapsed, empty
 * names dropped (= back to the colour name). null when it isn't a valid map
 * (not an object, an unknown colour, a non-string, over 30 characters). */
export function parseHighlightLabels(v: unknown): HighlightLabels | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null
  const out: HighlightLabels = {}
  for (const [key, raw] of Object.entries(v)) {
    if (!(HIGHLIGHT_COLORS as readonly string[]).includes(key)) return null
    if (raw === null) continue
    if (typeof raw !== 'string') return null
    const name = raw.replace(/\s+/gu, ' ').trim()
    if ([...name].length > HIGHLIGHT_LABEL_MAX) return null
    if (name) out[key as HighlightColor] = name
  }
  return out
}

/** Per-account preferences. null readerStyle = never chosen → onboarding
 * chooser; null textSize = never changed → 100%. supportNoticeDismissed: the
 * one-time "follow on Instagram" notice was closed (once per account).
 * highlightLabels: renamed colours only ({} = all called by their colour). */
export interface Preferences {
  readerStyle: ReaderStyle | null
  textSize: TextSize | null
  supportNoticeDismissed: boolean
  highlightLabels: HighlightLabels
}

/** PATCH /api/preferences body: any subset, at least one field. */
export type PreferencesPatch = Partial<{
  readerStyle: ReaderStyle
  textSize: TextSize
  /** One-way: only `true` is accepted. */
  supportNoticeDismissed: true
  /** Replaces the whole map (an absent colour = its colour name again). */
  highlightLabels: HighlightLabels
}>
