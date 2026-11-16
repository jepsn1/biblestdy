import { describe, expect, it } from 'vitest'
import { formatReference, parseReference } from './reference.js'
import {
  formatScriptureHref,
  parseScriptureHref,
  refTouchesChapter,
  refsInMarkdown,
  sameScriptureRef,
  scriptureLinkMarkdown,
  scriptureLinks,
  toScriptureRef,
} from './scripture-href.js'

describe('scripture href grammar', () => {
  it('parses verse, range, cross-chapter range and whole chapter', () => {
    expect(parseScriptureHref('bible:JHN.3.16')).toEqual({ book: 'JHN', chapter: 3, verse: 16 })
    expect(parseScriptureHref('bible:JHN.3.16-18')).toEqual({ book: 'JHN', chapter: 3, verse: 16, endVerse: 18 })
    expect(parseScriptureHref('bible:ROM.8.28-9.5')).toEqual({
      book: 'ROM',
      chapter: 8,
      verse: 28,
      endChapter: 9,
      endVerse: 5,
    })
    expect(parseScriptureHref('bible:PSA.23')).toEqual({ book: 'PSA', chapter: 23 })
    expect(parseScriptureHref('bible:1CO.13.4')).toEqual({ book: '1CO', chapter: 13, verse: 4 })
  })

  it('round-trips every canonical form', () => {
    for (const href of [
      'bible:JHN.3.16',
      'bible:JHN.3.16-18',
      'bible:ROM.8.28-9.5',
      'bible:PSA.23',
      'bible:ISA.52.13-53.12',
      'bible:JHN.7.53-8.11',
      'bible:3JN.1.14',
    ]) {
      expect(formatScriptureHref(parseScriptureHref(href)!)).toBe(href)
    }
  })

  it('normalizes a same-chapter end chapter', () => {
    expect(parseScriptureHref('bible:JHN.3.16-3.18')).toEqual({ book: 'JHN', chapter: 3, verse: 16, endVerse: 18 })
    expect(formatScriptureHref({ book: 'JHN', chapter: 3, verse: 16, endChapter: 3, endVerse: 18 })).toBe(
      'bible:JHN.3.16-18',
    )
  })

  it('rejects malformed hrefs', () => {
    for (const bad of [
      '',
      'bible:',
      'bible:JHN',
      'bible:XYZ.1.1',
      'bible:jhn.3.16',
      'bible:JHN.0.1',
      'bible:JHN.22.1',
      'bible:JHN.3.0',
      'bible:JHN.03.16',
      'bible:JHN.3.18-16',
      'bible:JHN.3.16-16',
      'bible:JHN.4.1-3.5',
      'bible:JHN.21.1-22.1',
      'bible:JHN.3-4',
      'bible:JHN.3.16-',
      'bible:JHN.3.16?from=WEB',
      'https://example.com',
      'bible:JHN.3.16.1',
    ]) {
      expect(parseScriptureHref(bad), bad).toBeNull()
    }
  })

  it('formats nothing without a chapter, and never an end without a start', () => {
    expect(formatScriptureHref({ book: 'JHN' })).toBeNull()
    expect(formatScriptureHref({ book: 'NOPE', chapter: 1 })).toBeNull()
    expect(formatScriptureHref({ book: 'JHN', chapter: 3, endVerse: 4 })).toBeNull()
  })

  it('takes a typed reference (parseReference) as is', () => {
    const typed = parseReference('rom 8,28-9,5', 'da')!
    expect(formatScriptureHref(typed)).toBe('bible:ROM.8.28-9.5')
    const same = parseReference('joh 3:16-18')!
    expect(toScriptureRef(same)).toEqual({ book: 'JHN', chapter: 3, verse: 16, endVerse: 18 })
    expect(sameScriptureRef(same, parseScriptureHref('bible:JHN.3.16-18')!)).toBe(true)
    expect(formatReference(parseScriptureHref('bible:ROM.8.28-9.5')!)).toBe('Romans 8:28-9:5')
  })

  it('knows which chapters a reference touches', () => {
    const r = parseScriptureHref('bible:ROM.8.28-9.5')!
    expect([7, 8, 9, 10].map((c) => refTouchesChapter(r, 'ROM', c))).toEqual([false, true, true, false])
    expect(refTouchesChapter(r, 'JHN', 8)).toBe(false)
    expect(refTouchesChapter(parseScriptureHref('bible:PSA.23')!, 'PSA', 23)).toBe(true)
  })
})

describe('refsInMarkdown', () => {
  it('finds several references in text order', () => {
    const body = 'See [Joh 3,16](bible:JHN.3.16) and\n\n- [Rom 8,28–9,5](bible:ROM.8.28-9.5)\n- [Sl 23](bible:PSA.23).'
    expect(refsInMarkdown(body)).toEqual([
      { book: 'JHN', chapter: 3, verse: 16 },
      { book: 'ROM', chapter: 8, verse: 28, endChapter: 9, endVerse: 5 },
      { book: 'PSA', chapter: 23 },
    ])
  })

  it('keeps one per reference (first mention), also across spellings', () => {
    const body = '[a](bible:JHN.3.16) [b](bible:PSA.23) [c](bible:JHN.3.16) [d](bible:JHN.3.16-3.17) [e](bible:JHN.3.16-17)'
    expect(refsInMarkdown(body).map((r) => formatScriptureHref(r))).toEqual([
      'bible:JHN.3.16',
      'bible:PSA.23',
      'bible:JHN.3.16-17',
    ])
    // …while scriptureLinks keeps every mention
    expect(scriptureLinks(body)).toHaveLength(5)
  })

  it('skips malformed and non-bible links, code and escaped brackets', () => {
    const body = [
      '[web](https://example.com) [bad](bible:XYZ.1.1) [half](bible:JHN.3.18-16) [empty](bible:)',
      '`[code](bible:JHN.1.1)` \\[not](bible:JHN.1.2)',
      '```',
      '[fenced](bible:JHN.1.3)',
      '```',
      '[ok](bible:JHN.1.4)',
    ].join('\n')
    expect(refsInMarkdown(body)).toEqual([{ book: 'JHN', chapter: 1, verse: 4 }])
  })

  it('reports offsets, unescaped text and the canonical href', () => {
    const body = 'x [Joh \\[3\\]](<bible:JHN.3.16-3.18> "t") y'
    const [link] = scriptureLinks(body)
    expect(link.text).toBe('Joh [3]')
    expect(link.href).toBe('bible:JHN.3.16-18')
    expect(body.slice(link.start, link.end)).toBe('[Joh \\[3\\]](<bible:JHN.3.16-3.18> "t")')
  })

  it('round-trips through scriptureLinkMarkdown', () => {
    const ref = parseScriptureHref('bible:ISA.52.13-53.12')!
    const md = scriptureLinkMarkdown(ref, 'Es [52]')!
    expect(md).toBe('[Es \\[52\\]](bible:ISA.52.13-53.12)')
    expect(scriptureLinks(md)[0]).toMatchObject({ ref, text: 'Es [52]' })
    expect(scriptureLinkMarkdown({ book: 'JHN' }, 'x')).toBeNull()
  })

  it('is empty for a body with no references', () => {
    expect(refsInMarkdown('')).toEqual([])
    expect(refsInMarkdown('Just [a link](https://x.y) and John 3:16 typed.')).toEqual([])
  })
})
