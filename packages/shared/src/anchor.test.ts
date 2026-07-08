import { describe, expect, it } from 'vitest'
import { buildAnchor, sameAnchor, wordRangeInVerse, words, type Anchor } from './anchor.js'

const meta = { translationId: 'WEB', book: 'JHN', chapter: 3 }

describe('words', () => {
  it('splits on whitespace and ignores padding', () => {
    expect(words('  For God so  loved ')).toEqual(['For', 'God', 'so', 'loved'])
  })
  it('is empty for blank text', () => {
    expect(words('   ')).toEqual([])
  })
})

describe('buildAnchor', () => {
  it('records a single-word selection', () => {
    expect(buildAnchor(meta, { verse: 16, word: 0 }, { verse: 16, word: 0 })).toEqual({
      ...meta,
      startVerse: 16,
      startWord: 0,
      endVerse: 16,
      endWord: 0,
    })
  })

  it('normalizes a backwards selection', () => {
    const forward = buildAnchor(meta, { verse: 16, word: 2 }, { verse: 17, word: 1 })
    const backward = buildAnchor(meta, { verse: 17, word: 1 }, { verse: 16, word: 2 })
    expect(backward).toEqual(forward)
    expect(forward.startVerse).toBe(16)
    expect(forward.endVerse).toBe(17)
  })

  it('normalizes backwards within a single verse', () => {
    expect(buildAnchor(meta, { verse: 16, word: 5 }, { verse: 16, word: 1 })).toMatchObject({
      startWord: 1,
      endWord: 5,
    })
  })
})

describe('wordRangeInVerse', () => {
  const single: Anchor = { ...meta, startVerse: 16, startWord: 2, endVerse: 16, endWord: 4 }
  const spanning: Anchor = { ...meta, startVerse: 16, startWord: 3, endVerse: 18, endWord: 1 }

  it('returns the exact range for a single-verse anchor', () => {
    expect(wordRangeInVerse(single, 16, 10)).toEqual({ start: 2, end: 4 })
  })

  it('returns null for verses outside the anchor', () => {
    expect(wordRangeInVerse(single, 15, 10)).toBeNull()
    expect(wordRangeInVerse(single, 17, 10)).toBeNull()
  })

  it('covers start verse from startWord to end of verse', () => {
    expect(wordRangeInVerse(spanning, 16, 8)).toEqual({ start: 3, end: 7 })
  })

  it('covers whole middle verses', () => {
    expect(wordRangeInVerse(spanning, 17, 6)).toEqual({ start: 0, end: 5 })
  })

  it('covers end verse from start to endWord', () => {
    expect(wordRangeInVerse(spanning, 18, 9)).toEqual({ start: 0, end: 1 })
  })

  it('returns null for an empty verse', () => {
    expect(wordRangeInVerse(spanning, 17, 0)).toBeNull()
  })
})

describe('sameAnchor', () => {
  it('distinguishes different spans and translations', () => {
    const a: Anchor = { ...meta, startVerse: 16, startWord: 0, endVerse: 16, endWord: 1 }
    expect(sameAnchor(a, { ...a })).toBe(true)
    expect(sameAnchor(a, { ...a, endWord: 2 })).toBe(false)
    expect(sameAnchor(a, { ...a, translationId: 'KJV' })).toBe(false)
  })
})
