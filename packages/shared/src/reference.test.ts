import { describe, expect, it } from 'vitest'
import { compareReferences, formatReference, parseReference } from './reference.js'

describe('parseReference', () => {
  it('parses book-only references', () => {
    expect(parseReference('John')).toEqual({ book: 'JHN' })
    expect(parseReference('Genesis')).toEqual({ book: 'GEN' })
    expect(parseReference('Song of Solomon')).toEqual({ book: 'SNG' })
  })

  it('parses book + chapter', () => {
    expect(parseReference('John 3')).toEqual({ book: 'JHN', chapter: 3 })
    expect(parseReference('Psalms 150')).toEqual({ book: 'PSA', chapter: 150 })
  })

  it('parses book chapter:verse', () => {
    expect(parseReference('John 3:16')).toEqual({ book: 'JHN', chapter: 3, verse: 16 })
  })

  it('parses verse ranges within a chapter', () => {
    expect(parseReference('John 3:16-18')).toEqual({
      book: 'JHN',
      chapter: 3,
      verse: 16,
      endChapter: 3,
      endVerse: 18,
    })
  })

  it('parses cross-chapter ranges', () => {
    expect(parseReference('John 3:16-4:2')).toEqual({
      book: 'JHN',
      chapter: 3,
      verse: 16,
      endChapter: 4,
      endVerse: 2,
    })
  })

  it('accepts common abbreviations and USFM ids', () => {
    expect(parseReference('Jn 3:16')).toEqual({ book: 'JHN', chapter: 3, verse: 16 })
    expect(parseReference('ps 23')).toEqual({ book: 'PSA', chapter: 23 })
    expect(parseReference('JHN 3')).toEqual({ book: 'JHN', chapter: 3 })
    expect(parseReference('Matt. 5:3')).toEqual({ book: 'MAT', chapter: 5, verse: 3 })
  })

  it('parses numbered books', () => {
    expect(parseReference('1 John 2:1')).toEqual({ book: '1JN', chapter: 2, verse: 1 })
    expect(parseReference('1john 2')).toEqual({ book: '1JN', chapter: 2 })
    expect(parseReference('2 Cor 5:17')).toEqual({ book: '2CO', chapter: 5, verse: 17 })
  })

  it('accepts Danish-style comma verse separator', () => {
    expect(parseReference('John 3,16')).toEqual({ book: 'JHN', chapter: 3, verse: 16 })
    expect(parseReference('John 3,16-18')).toEqual({
      book: 'JHN',
      chapter: 3,
      verse: 16,
      endChapter: 3,
      endVerse: 18,
    })
  })

  it('is case- and whitespace-insensitive', () => {
    expect(parseReference('  john   3:16 ')).toEqual({ book: 'JHN', chapter: 3, verse: 16 })
    expect(parseReference('JOHN 3 : 16')).toEqual({ book: 'JHN', chapter: 3, verse: 16 })
  })

  it('rejects malformed input', () => {
    expect(parseReference('')).toBeNull()
    expect(parseReference('Bogus 3:16')).toBeNull()
    expect(parseReference('3:16')).toBeNull()
    expect(parseReference('John 99')).toBeNull() // John has 21 chapters
    expect(parseReference('John 0:1')).toBeNull()
    expect(parseReference('John 3:16-16')).toBeNull() // empty range
    expect(parseReference('John 3:16-2:1')).toBeNull() // backwards range
  })
})

describe('formatReference', () => {
  it('round-trips parsed references', () => {
    for (const input of ['John', 'John 3', 'John 3:16', 'John 3:16-18', 'John 3:16-4:2']) {
      const ref = parseReference(input)
      expect(ref).not.toBeNull()
      expect(formatReference(ref!)).toBe(input)
    }
  })

  it('formats abbreviated input as full names', () => {
    expect(formatReference(parseReference('jn 3:16')!)).toBe('John 3:16')
  })
})

describe('compareReferences', () => {
  it('orders canonically: book, then chapter, then verse', () => {
    const gen = parseReference('Genesis 1:1')!
    const john316 = parseReference('John 3:16')!
    const john317 = parseReference('John 3:17')!
    const john4 = parseReference('John 4:1')!
    const rev = parseReference('Revelation 22:21')!

    expect(compareReferences(gen, john316)).toBeLessThan(0)
    expect(compareReferences(john316, john317)).toBeLessThan(0)
    expect(compareReferences(john317, john4)).toBeLessThan(0)
    expect(compareReferences(john4, rev)).toBeLessThan(0)
    expect(compareReferences(john316, john316)).toBe(0)
  })

  it('sorts whole-book and whole-chapter refs before their verses', () => {
    expect(compareReferences(parseReference('John')!, parseReference('John 1:1')!)).toBeLessThan(0)
    expect(compareReferences(parseReference('John 3')!, parseReference('John 3:1')!)).toBeLessThan(0)
  })
})
