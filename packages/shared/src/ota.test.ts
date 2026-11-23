import { describe, expect, it } from 'vitest'
import {
  bootOutcome,
  bundleVersion,
  currentVersion,
  decide,
  dropBundles,
  emptyState,
  HISTORY_LIMIT,
  LOG_LIMIT,
  manifestFor,
  parseSignedManifest,
  promote,
  prunable,
  publish,
  readManifest,
  rememberFailed,
  rollback,
  safeToApply,
  type OtaBundle,
  type OtaManifest,
} from './ota'

const AT = '2026-11-23T12:00:00.000Z'
const NATIVE = 'n1'

function bundle(version: string, extra: Partial<OtaBundle> = {}): OtaBundle {
  return {
    version,
    file: `bundles/${version}.zip`,
    size: 100,
    sha256: `sha-${version}`,
    checksum: 'ab12',
    sessionKey: 'aXY=:a2V5',
    native: NATIVE,
    commit: 'abcdef0',
    builtAt: AT,
    ...extra,
  }
}

describe('bundleVersion (bump)', () => {
  it('is commit time (UTC) + short sha, and sorts by time', () => {
    const a = bundleVersion(Date.UTC(2026, 10, 23, 9, 5, 7) / 1000, '36911A5ffff')
    const b = bundleVersion(Date.UTC(2026, 10, 23, 10, 0, 0) / 1000, '0000000aaaa')
    expect(a).toBe('20261123.090507-36911a5')
    expect([b, a].sort()).toEqual([a, b])
  })
  it('the same commit always gives the same version', () => {
    expect(bundleVersion(1_700_000_000, 'abcdef1')).toBe(bundleVersion(1_700_000_000, 'abcdef1'))
  })
  it('refuses a non-sha', () => {
    expect(() => bundleVersion(1, 'nope')).toThrow()
  })
})

describe('publish', () => {
  it('puts the bundle on the channel; stable untouched', () => {
    const { state, changed } = publish(emptyState(), bundle('v1'), 'dev', AT)
    expect(changed).toBe(true)
    expect(currentVersion(state, 'dev')).toBe('v1')
    expect(currentVersion(state, 'stable')).toBeNull()
    expect(state.log).toEqual([{ at: AT, channel: 'dev', action: 'publish', version: 'v1' }])
  })
  it('republishing the current version is a no-op', () => {
    const s1 = publish(emptyState(), bundle('v1'), 'dev', AT).state
    const r = publish(s1, bundle('v1'), 'dev', AT)
    expect(r.changed).toBe(false)
    expect(r.state.channels.dev).toEqual(['v1'])
  })
  it('refuses the same version with different contents (checksum)', () => {
    const s1 = publish(emptyState(), bundle('v1'), 'dev', AT).state
    expect(() => publish(s1, bundle('v1', { sha256: 'other' }), 'dev', AT)).toThrow(/different contents/)
  })
  it('keeps history and log bounded; only bundles neither mentions are prunable', () => {
    let s = emptyState()
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) s = publish(s, bundle(`v${i}`), 'dev', AT).state
    expect(s.channels.dev).toHaveLength(HISTORY_LIMIT)
    expect(currentVersion(s, 'dev')).toBe(`v${HISTORY_LIMIT + 4}`)
    expect(prunable(s)).toEqual([]) // still in the log: can be rolled to
    for (let i = HISTORY_LIMIT + 5; i < LOG_LIMIT + 5; i++) s = publish(s, bundle(`v${i}`), 'dev', AT).state
    expect(s.log).toHaveLength(LOG_LIMIT)
    expect(prunable(s)).toEqual(['v0', 'v1', 'v2', 'v3', 'v4'])
    expect(Object.keys(dropBundles(s, prunable(s)).bundles)).toHaveLength(LOG_LIMIT)
  })
})

describe('promote', () => {
  const dev2 = publish(publish(emptyState(), bundle('v1'), 'dev', AT).state, bundle('v2'), 'dev', AT).state
  it('copies dev’s current to stable', () => {
    const r = promote(dev2, AT)
    expect(r.version).toBe('v2')
    expect(currentVersion(r.state, 'stable')).toBe('v2')
    expect(currentVersion(r.state, 'dev')).toBe('v2')
  })
  it('can promote an earlier dev version', () => {
    expect(currentVersion(promote(dev2, AT, { version: 'v1' }).state, 'stable')).toBe('v1')
  })
  it('refuses a version dev never had, and an empty dev', () => {
    expect(() => promote(dev2, AT, { version: 'v9' })).toThrow()
    expect(() => promote(emptyState(), AT)).toThrow(/nothing published/)
  })
  it('promoting again is a no-op', () => {
    const once = promote(dev2, AT).state
    expect(promote(once, AT).changed).toBe(false)
  })
})

describe('rollback', () => {
  let s = emptyState()
  for (const v of ['v1', 'v2', 'v3']) s = publish(s, bundle(v), 'dev', AT).state
  it('repoints at the previous bundle (and further on repeat)', () => {
    const r1 = rollback(s, 'dev', AT)
    expect(r1.version).toBe('v2')
    const r2 = rollback(r1.state, 'dev', AT)
    expect(r2.version).toBe('v1')
    expect(() => rollback(r2.state, 'dev', AT)).toThrow(/no earlier/)
    // the bundles stay, so a later rollback-to can bring v3 back
    expect(r2.state.bundles.v3).toBeDefined()
  })
  it('rolls forward again to the version it rolled back from', () => {
    const back = rollback(s, 'dev', AT).state
    expect(currentVersion(rollback(back, 'dev', AT, 'v3').state, 'dev')).toBe('v3')
  })
  it('to a named version that channel served', () => {
    const r = rollback(s, 'dev', AT, 'v1')
    expect(currentVersion(r.state, 'dev')).toBe('v1')
    expect(rollback(r.state, 'dev', AT).version).toBe('v3')
    expect(() => rollback(s, 'dev', AT, 'v9')).toThrow()
  })
  it('a stable rollback leaves dev alone', () => {
    let t = promote(s, AT, { version: 'v1' }).state
    t = promote(t, AT).state
    const r = rollback(t, 'stable', AT)
    expect(currentVersion(r.state, 'stable')).toBe('v1')
    expect(currentVersion(r.state, 'dev')).toBe('v3')
  })
})

describe('manifest', () => {
  const s = publish(emptyState(), bundle('v1'), 'dev', AT).state
  it('manifestFor carries checksum, session key, native and an absolute url', () => {
    const m = manifestFor(s, 'dev', 'https://biblestdy.com/ota/', 42)!
    expect(m).toEqual({
      schema: 1,
      channel: 'dev',
      seq: 42,
      version: 'v1',
      url: 'https://biblestdy.com/ota/bundles/v1.zip',
      size: 100,
      checksum: 'ab12',
      sessionKey: 'aXY=:a2V5',
      native: NATIVE,
    })
    expect(manifestFor(s, 'stable', 'https://x', 1)).toBeNull()
  })
  it('readManifest takes it back, only for its channel and origin over https', () => {
    const m = manifestFor(s, 'dev', 'https://biblestdy.com/ota', 42)!
    const text = JSON.stringify(m)
    expect(readManifest(text, 'dev', 'https://biblestdy.com')).toEqual(m)
    expect(readManifest(text, 'stable', 'https://biblestdy.com')).toBeNull()
    expect(readManifest(text, 'dev', 'https://evil.example')).toBeNull()
    const http = JSON.stringify({ ...m, url: 'http://biblestdy.com/ota/bundles/v1.zip' })
    expect(readManifest(http, 'dev', 'https://biblestdy.com')).toBeNull()
    // local test builds (http origin) may use http
    const local = JSON.stringify({ ...m, url: 'http://localhost:5919/ota/bundles/v1.zip' })
    expect(readManifest(local, 'dev', 'http://localhost:5919')).not.toBeNull()
    expect(readManifest('{nope', 'dev', 'https://biblestdy.com')).toBeNull()
    expect(readManifest(JSON.stringify({ ...m, checksum: '' }), 'dev', 'https://biblestdy.com')).toBeNull()
  })
  it('parseSignedManifest wants payload + signature strings', () => {
    expect(parseSignedManifest('{"payload":"{}","signature":"c2ln"}')).toEqual({ payload: '{}', signature: 'c2ln' })
    expect(parseSignedManifest('{"payload":{},"signature":"x"}')).toBeNull()
    expect(parseSignedManifest('<!doctype html>')).toBeNull()
  })
})

describe('decide (compat guard and friends)', () => {
  const m: OtaManifest = {
    schema: 1,
    channel: 'dev',
    seq: 10,
    version: 'v2',
    url: 'https://biblestdy.com/ota/bundles/v2.zip',
    size: 1,
    checksum: 'ab',
    sessionKey: 'a:b',
    native: NATIVE,
  }
  const running = { version: 'v1', native: NATIVE }
  const seen = { lastSeq: 0, failed: [] as string[], pending: null }
  it('takes a newer compatible bundle', () => {
    expect(decide(m, running, seen)).toEqual({ take: true, manifest: m })
  })
  it('takes an older one too — that is how a rollback arrives', () => {
    expect(decide({ ...m, version: 'v0' }, running, seen).take).toBe(true)
  })
  it('skips what it runs', () => {
    expect(decide(m, { ...running, version: 'v2' }, seen)).toEqual({ take: false, why: 'same' })
  })
  it('refuses a bundle for another native build', () => {
    expect(decide({ ...m, native: 'n2' }, running, seen)).toEqual({ take: false, why: 'incompatible' })
  })
  it('refuses a replayed older manifest', () => {
    expect(decide(m, running, { ...seen, lastSeq: 11 })).toEqual({ take: false, why: 'stale' })
  })
  it('does not retry a version that failed to boot, or re-download a pending one', () => {
    expect(decide(m, running, { ...seen, failed: ['v2'] })).toEqual({ take: false, why: 'failed-before' })
    expect(decide(m, running, { ...seen, pending: 'v2' })).toEqual({ take: false, why: 'already-pending' })
  })
})

describe('boot outcome, failures, when to apply', () => {
  it('bootOutcome', () => {
    expect(bootOutcome(null, 'v1')).toBe('none')
    expect(bootOutcome('v2', 'v2')).toBe('applied')
    expect(bootOutcome('v2', 'v1')).toBe('rolled-back')
  })
  it('rememberFailed is bounded and deduped', () => {
    let f: string[] = []
    for (let i = 0; i < 12; i++) f = rememberFailed(f, `v${i}`)
    expect(f).toHaveLength(10)
    expect(rememberFailed(['a', 'b'], 'a')).toEqual(['b', 'a'])
  })
  it('safeToApply: never mid-edit or once touched', () => {
    expect(safeToApply({ editing: false, touchedSinceForeground: false })).toBe(true)
    expect(safeToApply({ editing: true, touchedSinceForeground: false })).toBe(false)
    expect(safeToApply({ editing: false, touchedSinceForeground: true })).toBe(false)
  })
})
