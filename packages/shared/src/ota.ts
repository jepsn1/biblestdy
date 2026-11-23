/**
 * Over-the-air web bundles for the app shell (#19, PRD #14 "OTA, self-hosted").
 *
 * Pure rules shared by the publisher (apps/mobile/scripts/ota.mjs, on the
 * server) and the app (apps/web/app/lib/ota): what a bundle and a channel
 * manifest are, how a channel moves (publish, promote, rollback), and
 * whether the app should take what a manifest offers. No fs, network or
 * crypto here — the callers do those and hand the results in.
 *
 * Trust: a manifest is a JSON `payload` string plus an RSA signature over
 * exactly those bytes, made with a private key that only the server holds.
 * The app verifies it with the public key compiled into its build before it
 * looks at a single field; the bundle's checksum inside is signed again for
 * the native updater, which re-checks the downloaded zip on its own.
 */

export const OTA_CHANNELS = ['dev', 'stable'] as const
export type OtaChannel = (typeof OTA_CHANNELS)[number]

export function isOtaChannel(v: unknown): v is OtaChannel {
  return typeof v === 'string' && (OTA_CHANNELS as readonly string[]).includes(v)
}

/** One built web bundle. Immutable once published. */
export type OtaBundle = {
  /** `YYYYMMDD.HHMMSS-<sha7>` from the commit it was built from (UTC). */
  version: string
  /** Path under the OTA root, e.g. `bundles/<version>.zip`. */
  file: string
  /** Bytes of the (encrypted) file as served. */
  size: number
  /** Hex SHA-256 of the plain zip. */
  sha256: string
  /** For the native updater: the sha256, signed (RSA private-key encrypt), hex. */
  checksum: string
  /** For the native updater: `ivBase64:encryptedAesKeyBase64`. */
  sessionKey: string
  /** Native fingerprint the bundle was built against (see apps/mobile/scripts/native-fingerprint.mjs). */
  native: string
  /** Human-readable list of the native plugins behind `native`. */
  plugins?: string[]
  commit: string
  builtAt: string
}

export type OtaLogEntry = {
  at: string
  channel: OtaChannel
  action: 'publish' | 'promote' | 'rollback'
  version: string
}

/** The publisher's own record (never served). A channel's history is a
 * stack: the last entry is what the channel serves. */
export type OtaState = {
  bundles: Record<string, OtaBundle>
  channels: Partial<Record<OtaChannel, string[]>>
  log: OtaLogEntry[]
}

/** What `<channel>.json` says, inside its signed payload. */
export type OtaManifest = {
  schema: 1
  channel: OtaChannel
  /** Signing time (ms). The app ignores a manifest older than one it has
   * already seen on that channel, so an old signed file can't be replayed. */
  seq: number
  version: string
  /** Absolute https URL of the bundle zip. */
  url: string
  size: number
  checksum: string
  sessionKey: string
  native: string
}

export type SignedManifest = { payload: string; signature: string }

/** History kept per channel (older entries drop off; their zips can be pruned). */
export const HISTORY_LIMIT = 20

export function emptyState(): OtaState {
  return { bundles: {}, channels: {}, log: [] }
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0')

/** `YYYYMMDD.HHMMSS-<sha7>`: sorts by commit time, and the same commit always
 * gets the same version — so the app shipped in a native build and the
 * server's bundle of that commit are recognised as one. */
export function bundleVersion(commitTimeSec: number, sha: string): string {
  const d = new Date(commitTimeSec * 1000)
  const date = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`
  const time = `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`
  const short = sha.trim().slice(0, 7).toLowerCase()
  if (!/^[0-9a-f]{7}$/.test(short)) throw new Error(`bundleVersion: not a commit sha: "${sha}"`)
  return `${date}.${time}-${short}`
}

const VERSION_RE = /^[0-9A-Za-z][0-9A-Za-z._-]{0,63}$/

export function isBundleVersion(v: unknown): v is string {
  return typeof v === 'string' && VERSION_RE.test(v)
}

export function currentVersion(state: OtaState, channel: OtaChannel): string | null {
  const h = state.channels[channel]
  return h && h.length ? h[h.length - 1]! : null
}

/** The log keeps this many entries. */
export const LOG_LIMIT = 200

const logged = (state: OtaState, entry: OtaLogEntry) => [...state.log, entry].slice(-LOG_LIMIT)

/** Whether a channel has ever served `version` (still in its history, or
 * rolled back from but still logged). */
function servedOn(state: OtaState, channel: OtaChannel, version: string): boolean {
  return (state.channels[channel] ?? []).includes(version) || state.log.some((e) => e.channel === channel && e.version === version)
}

function pushVersion(state: OtaState, channel: OtaChannel, version: string, action: OtaLogEntry['action'], at: string): OtaState {
  const history = [...(state.channels[channel] ?? []), version].slice(-HISTORY_LIMIT)
  return {
    ...state,
    channels: { ...state.channels, [channel]: history },
    log: logged(state, { at, channel, action, version }),
  }
}

export type Change = { state: OtaState; changed: boolean; version: string }

/** A new build goes out on a channel (deploy → dev). Publishing the version
 * the channel already serves changes nothing. */
export function publish(state: OtaState, bundle: OtaBundle, channel: OtaChannel, at: string): Change {
  if (!isBundleVersion(bundle.version)) throw new Error(`publish: bad version "${bundle.version}"`)
  const known = state.bundles[bundle.version]
  if (known && known.sha256 !== bundle.sha256) {
    throw new Error(`publish: ${bundle.version} already exists with different contents`)
  }
  const withBundle = known ? state : { ...state, bundles: { ...state.bundles, [bundle.version]: bundle } }
  if (currentVersion(withBundle, channel) === bundle.version) {
    return { state: withBundle, changed: withBundle !== state, version: bundle.version }
  }
  return { state: pushVersion(withBundle, channel, bundle.version, 'publish', at), changed: true, version: bundle.version }
}

/** Promote: `to` starts serving what `from` serves now (dev → stable), or a
 * given version that `from` has served. */
export function promote(
  state: OtaState,
  at: string,
  opts: { from?: OtaChannel; to?: OtaChannel; version?: string } = {},
): Change {
  const from = opts.from ?? 'dev'
  const to = opts.to ?? 'stable'
  if (from === to) throw new Error('promote: from and to are the same channel')
  const version = opts.version ?? currentVersion(state, from)
  if (!version) throw new Error(`promote: ${from} has nothing published`)
  if (!servedOn(state, from, version)) throw new Error(`promote: ${version} was never on ${from}`)
  if (!state.bundles[version]) throw new Error(`promote: no bundle ${version}`)
  if (currentVersion(state, to) === version) return { state, changed: false, version }
  return { state: pushVersion(state, to, version, 'promote', at), changed: true, version }
}

/** Rollback: the channel goes back to what it served before (its history
 * pops one), or to a named version it has served — which can also roll
 * forward again after a rollback. The bundles themselves stay. */
export function rollback(state: OtaState, channel: OtaChannel, at: string, toVersion?: string): Change {
  const history = state.channels[channel] ?? []
  const current = currentVersion(state, channel)
  if (!current) throw new Error(`rollback: ${channel} has nothing published`)
  let next: string[]
  if (toVersion) {
    if (!servedOn(state, channel, toVersion)) throw new Error(`rollback: ${toVersion} was never on ${channel}`)
    if (!state.bundles[toVersion]) throw new Error(`rollback: no bundle ${toVersion}`)
    if (toVersion === current) return { state, changed: false, version: current }
    next = [...history, toVersion].slice(-HISTORY_LIMIT)
  } else {
    let i = history.length - 1
    while (i >= 0 && history[i] === current) i--
    if (i < 0) throw new Error(`rollback: ${channel} has no earlier bundle`)
    next = history.slice(0, i + 1)
  }
  const version = next[next.length - 1]!
  return {
    state: {
      ...state,
      channels: { ...state.channels, [channel]: next },
      log: logged(state, { at, channel, action: 'rollback', version }),
    },
    changed: true,
    version,
  }
}

/** Bundles neither a channel's history nor the log mentions any more —
 * their zips can go. */
export function prunable(state: OtaState): string[] {
  const live = new Set([...Object.values(state.channels).flat(), ...state.log.map((e) => e.version)])
  return Object.keys(state.bundles).filter((v) => !live.has(v))
}

export function dropBundles(state: OtaState, versions: string[]): OtaState {
  const bundles = { ...state.bundles }
  for (const v of versions) delete bundles[v]
  return { ...state, bundles }
}

/** The manifest a channel serves (null: nothing published yet). */
export function manifestFor(state: OtaState, channel: OtaChannel, baseUrl: string, seq: number): OtaManifest | null {
  const version = currentVersion(state, channel)
  if (!version) return null
  const b = state.bundles[version]
  if (!b) throw new Error(`manifestFor: ${channel} points at unknown bundle ${version}`)
  return {
    schema: 1,
    channel,
    seq,
    version,
    url: `${baseUrl.replace(/\/+$/, '')}/${b.file}`,
    size: b.size,
    checksum: b.checksum,
    sessionKey: b.sessionKey,
    native: b.native,
  }
}

// ---- the app's side --------------------------------------------------------

export function parseSignedManifest(text: string): SignedManifest | null {
  try {
    const v = JSON.parse(text) as Partial<SignedManifest>
    if (typeof v.payload !== 'string' || typeof v.signature !== 'string' || !v.payload || !v.signature) return null
    return { payload: v.payload, signature: v.signature }
  } catch {
    return null
  }
}

/** A verified payload's fields, checked; null if anything is off. The
 * bundle must come from `origin` (the manifest's own server) over https —
 * plain http only when the build's OTA origin is itself http (local test
 * builds). */
export function readManifest(payload: string, channel: OtaChannel, origin: string): OtaManifest | null {
  let m: Partial<OtaManifest>
  try {
    m = JSON.parse(payload) as Partial<OtaManifest>
  } catch {
    return null
  }
  if (m.schema !== 1 || m.channel !== channel) return null
  if (typeof m.seq !== 'number' || !Number.isFinite(m.seq)) return null
  if (!isBundleVersion(m.version)) return null
  if (typeof m.size !== 'number' || m.size <= 0) return null
  if (typeof m.checksum !== 'string' || !/^[0-9a-f]+$/.test(m.checksum)) return null
  if (typeof m.sessionKey !== 'string' || !/^[^:]+:[^:]+$/.test(m.sessionKey)) return null
  if (typeof m.native !== 'string' || !m.native) return null
  if (typeof m.url !== 'string' || !sameOrigin(m.url, origin)) return null
  return m as OtaManifest
}

function sameOrigin(url: string, origin: string): boolean {
  let u: URL
  let o: URL
  try {
    u = new URL(url)
    o = new URL(origin)
  } catch {
    return false
  }
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && o.protocol === 'http:')) return false
  return u.origin === o.origin
}

export type Running = {
  /** The running bundle's version (compiled into it). */
  version: string
  /** The running bundle's native fingerprint — always the installed native
   * build's: the builtin bundle is built with it, and any bundle the app
   * took had to match (a new native build resets to the builtin). */
  native: string
}

export type Decision =
  | { take: true; manifest: OtaManifest }
  | { take: false; why: 'same' | 'stale' | 'incompatible' | 'failed-before' | 'already-pending' }

/** Should the app download what this (verified, read) manifest offers? */
export function decide(
  m: OtaManifest,
  running: Running,
  seen: { lastSeq: number; failed: readonly string[]; pending: string | null },
): Decision {
  if (m.seq < seen.lastSeq) return { take: false, why: 'stale' }
  if (m.version === running.version) return { take: false, why: 'same' }
  // Native-compat guard: a bundle built against other native plugins (or
  // other versions of them, or another shell config) could call native code
  // this build hasn't got. It waits for a native build that matches.
  if (m.native !== running.native) return { take: false, why: 'incompatible' }
  if (seen.failed.includes(m.version)) return { take: false, why: 'failed-before' }
  if (seen.pending === m.version) return { take: false, why: 'already-pending' }
  return { take: true, manifest: m }
}

/** What happened to the last bundle the app switched to, read at boot:
 * we record the version before switching; booting any other version means
 * the native side rolled it back (it never called notifyAppReady). */
export function bootOutcome(applying: string | null, runningVersion: string): 'none' | 'applied' | 'rolled-back' {
  if (!applying) return 'none'
  return applying === runningVersion ? 'applied' : 'rolled-back'
}

/** Failed versions remembered (newest last, bounded). */
export function rememberFailed(failed: readonly string[], version: string, limit = 10): string[] {
  return [...failed.filter((v) => v !== version), version].slice(-limit)
}

/** Whether a downloaded bundle may be switched to right now (the page
 * reloads): only at the moment the app comes to the front — launch or
 * resume — before the reader has touched it, and never while a text field
 * has focus (mid-edit: it waits for the next launch or resume). */
export function safeToApply(s: { editing: boolean; touchedSinceForeground: boolean }): boolean {
  return !s.editing && !s.touchedSinceForeground
}
