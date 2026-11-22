import { describe, expect, it } from 'vitest'
import { daysLeft, TRASH_MS } from './trash.js'

describe('daysLeft', () => {
  const at = '2026-11-22T10:34:57.000Z'
  const t0 = Date.parse(at)
  it('is 30 right after a delete', () => {
    expect(daysLeft(at, t0 + 1000)).toBe(30)
  })
  it('is 1 on the last day, 0 after', () => {
    expect(daysLeft(at, t0 + TRASH_MS - 1000)).toBe(1)
    expect(daysLeft(at, t0 + TRASH_MS + 1e6)).toBe(0)
  })
})
