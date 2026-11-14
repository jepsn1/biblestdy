import { describe, expect, it } from 'vitest'
import { parseHighlightLabels } from './preferences'

describe('parseHighlightLabels', () => {
  it('keeps renamed colours, trimmed and with whitespace collapsed', () => {
    expect(parseHighlightLabels({ blue: '  God   speaking ', rose: 'Sin' })).toEqual({
      blue: 'God speaking',
      rose: 'Sin',
    })
  })

  it('drops empty / null names (= back to the colour name)', () => {
    expect(parseHighlightLabels({ blue: '   ', green: null, gold: '' })).toEqual({})
    expect(parseHighlightLabels({})).toEqual({})
  })

  it('rejects anything that is not a map of known colours to short strings', () => {
    expect(parseHighlightLabels(null)).toBeNull()
    expect(parseHighlightLabels('blue')).toBeNull()
    expect(parseHighlightLabels(['blue'])).toBeNull()
    expect(parseHighlightLabels({ teal: 'x' })).toBeNull()
    expect(parseHighlightLabels({ blue: 3 })).toBeNull()
    expect(parseHighlightLabels({ blue: 'x'.repeat(31) })).toBeNull()
  })

  it('counts characters, not UTF-16 units (30 emoji/æøå fit)', () => {
    expect(parseHighlightLabels({ blue: 'å'.repeat(30) })).toEqual({ blue: 'å'.repeat(30) })
    expect(parseHighlightLabels({ blue: '🕊'.repeat(30) })).toEqual({ blue: '🕊'.repeat(30) })
  })
})
