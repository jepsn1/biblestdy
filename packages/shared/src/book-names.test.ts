import { describe, expect, it } from 'vitest'
import { bookName, findBook, suggestBooks } from './books.js'
import { parseReference } from './reference.js'

describe('Danish book names (#53)', () => {
  it('parses Danish names and abbreviations', () => {
    expect(parseReference('1 kor 13')).toEqual({ book: '1CO', chapter: 13 })
    expect(parseReference('1. Mos 1,1')).toEqual({ book: 'GEN', chapter: 1, verse: 1 })
    expect(parseReference('Johannes 3,16')).toEqual({ book: 'JHN', chapter: 3, verse: 16 })
    expect(parseReference('åb 22')).toEqual({ book: 'REV', chapter: 22 })
    expect(parseReference('ab 22')).toEqual({ book: 'REV', chapter: 22 })
    expect(parseReference('Hojsangen 2')).toEqual({ book: 'SNG', chapter: 2 })
    expect(parseReference('sl 23')).toEqual({ book: 'PSA', chapter: 23 })
  })

  it('lets the UI locale decide clashing abbreviations', () => {
    expect(findBook('es')?.id).toBe('EST')
    expect(findBook('es', 'da')?.id).toBe('ISA')
    expect(findBook('ez', 'da')?.id).toBe('EZK')
    // Unambiguous names work in either locale
    expect(findBook('esajas')?.id).toBe('ISA')
    expect(findBook('esther', 'da')?.id).toBe('EST')
  })

  it('accepts an en dash in ranges', () => {
    expect(parseReference('joh 3:16–18')).toMatchObject({ verse: 16, endVerse: 18 })
  })

  it('names books per locale', () => {
    expect(bookName('JHN')).toBe('John')
    expect(bookName('JHN', 'da')).toBe('Johannes')
    expect(bookName('XXX', 'da')).toBe('XXX')
  })
})

describe('suggestBooks', () => {
  it('"joh" → John first, with both names', () => {
    const s = suggestBooks('joh', 'da')
    expect(s[0]).toEqual({ id: 'JHN', name: 'Johannes', alt: 'John' })
    expect(s.map((x) => x.id)).toEqual(['JHN', '1JN', '2JN', '3JN', 'REV'])
  })

  it('matches English names in a Danish UI and vice versa', () => {
    expect(suggestBooks('rev', 'da')[0]?.id).toBe('REV')
    expect(suggestBooks('romer', 'en')[0]).toEqual({ id: 'ROM', name: 'Romans', alt: 'Romerbrevet' })
  })

  it('matches a numbered book by its name word', () => {
    expect(suggestBooks('kor', 'da').map((x) => x.id)).toEqual(['1CO', '2CO'])
    expect(suggestBooks('1kor', 'da').map((x) => x.id)).toEqual(['1CO'])
  })

  it('prefers the UI locale on clashes', () => {
    expect(suggestBooks('es', 'da')[0]?.id).toBe('ISA')
    expect(suggestBooks('es', 'en')[0]?.id).toBe('EST')
  })

  it('returns nothing for empty or unknown input; respects the limit', () => {
    expect(suggestBooks('  ')).toEqual([])
    expect(suggestBooks('zzz')).toEqual([])
    expect(suggestBooks('j', 'en', 3)).toHaveLength(3)
  })
})
