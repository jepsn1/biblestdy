import { CapacitorUpdater } from "@capgo/capacitor-updater";
import {
  bootOutcome,
  decide,
  isOtaChannel,
  parseSignedManifest,
  readManifest,
  rememberFailed,
  safeToApply,
  type OtaChannel,
} from "@biblestdy/shared/ota";
import { verifyManifest } from "./ota-verify";

/**
 * Over-the-air web updates in the app shell (#19) — loaded only inside
 * Capacitor (entry.client), so the web never carries it.
 *
 * - On launch and on every resume it fetches the signed manifest of the
 *   app's channel (https://biblestdy.com/ota/<channel>.json), verifies it,
 *   and downloads the bundle it names if `decide` says so: a different
 *   version, built for this exact native build (fingerprint), not one that
 *   failed here before. The native updater decrypts and checks the zip's
 *   signed checksum itself.
 * - It switches to a downloaded bundle (a page reload) only at a safe
 *   moment: at launch before the first render, or when the app comes back
 *   to the front — and right after a download that finished before the
 *   reader touched anything. Never mid-edit (a focused field with text in
 *   it); pending note saves are flushed first (note-panel saves on
 *   `pagehide`).
 * - Every boot calls notifyAppReady once the app has rendered. A bundle
 *   that never gets there is rolled back by the native side after
 *   appReadyTimeout; we see it at the next boot (bootOutcome) and never
 *   take that version again.
 *
 * The channel is baked into the app's own web build (VITE_OTA_CHANNEL, set
 * by ios.yml) and remembered, since bundles from the server don't carry
 * one; a new native build always boots its own web build first.
 */

const BUILD = __OTA_BUILD__;
const ORIGIN = (import.meta.env.VITE_OTA_ORIGIN || "https://biblestdy.com").replace(/\/+$/, "");
const BAKED = import.meta.env.VITE_OTA_CHANNEL;

const K = {
  channel: "ota:channel",
  applying: "ota:applying",
  pending: "ota:pending",
  failed: "ota:failed",
  seq: (c: OtaChannel) => `ota:seq:${c}`,
};

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}
function write(key: string, value: unknown) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or blocked: worst case we fetch again
  }
}

/** A downloaded bundle waiting for its moment, and the native build it was
 * taken for (a native update in between makes it unusable). */
type Pending = { id: string; version: string; native: string };

/** The pending bundle, if this native build may still switch to it. */
function usablePending(): Pending | null {
  const p = read<Pending>(K.pending);
  if (!p) return null;
  if (p.version === BUILD.version || p.native !== BUILD.native) {
    write(K.pending, null);
    return null;
  }
  return p;
}

function log(...args: unknown[]) {
  console.info("[ota]", ...args);
}

/** The channel this install follows. */
export function otaChannel(): OtaChannel {
  if (isOtaChannel(BAKED)) {
    write(K.channel, BAKED);
    return BAKED;
  }
  const kept = read<string>(K.channel);
  return isOtaChannel(kept) ? kept : "stable";
}

/** Mid-edit: a focused text field with something in it. (An empty field
 * that merely has focus — the sign-in page's autofocused email — isn't;
 * typing into it counts as a touch anyway.) */
function editing(): boolean {
  const el = document.activeElement;
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return (el.textContent ?? "").trim() !== "";
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.value !== "";
  return el instanceof HTMLSelectElement;
}

let touched = false;
let checking: Promise<void> | null = null;
let applying = false;

/** Note saves that wait for a pause go now (note-panel flushes on pagehide;
 * the reload would fire it too — this gives them a head start). */
async function flushSaves() {
  window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false }));
  await new Promise((r) => setTimeout(r, 300));
}

async function applyPending(reason: string): Promise<boolean> {
  const pending = usablePending();
  if (!pending || applying) return false;
  if (!safeToApply({ editing: editing(), touchedSinceForeground: touched })) return false;
  applying = true;
  try {
    await flushSaves();
    // Re-check after the flush's pause: a tap in it wins
    if (!safeToApply({ editing: editing(), touchedSinceForeground: touched })) return false;
    log(`switching to ${pending.version} (${reason})`);
    write(K.applying, pending.version);
    write(K.pending, null);
    await CapacitorUpdater.set({ id: pending.id }); // reloads the page
    return true;
  } catch (e) {
    log("switch failed", e);
    write(K.applying, null);
    write(K.pending, null);
    return false;
  } finally {
    applying = false;
  }
}

async function fetchManifest(channel: OtaChannel) {
  const res = await fetch(`${ORIGIN}/ota/${channel}.json`, { cache: "no-store", credentials: "omit" });
  if (!res.ok) return null;
  const signed = parseSignedManifest(await res.text());
  if (!signed || !(await verifyManifest(signed, BUILD.publicKey))) {
    log("manifest unsigned or signature invalid — ignored");
    return null;
  }
  return readManifest(signed.payload, channel, ORIGIN);
}

async function checkNow() {
  const channel = otaChannel();
  const m = await fetchManifest(channel);
  if (!m) return;
  const lastSeq = read<number>(K.seq(channel)) ?? 0;
  const pending = usablePending();
  const d = decide(m, BUILD, { lastSeq, failed: read<string[]>(K.failed) ?? [], pending: pending?.version ?? null });
  write(K.seq(channel), Math.max(lastSeq, m.seq));
  if (!d.take) {
    if (d.why !== "same" && d.why !== "already-pending") log(`not taking ${m.version}: ${d.why}`);
    // The channel went back to what we run (rollback): drop a newer download
    if (d.why === "same" && pending) {
      write(K.pending, null);
      void CapacitorUpdater.delete({ id: pending.id }).catch(() => {});
    }
    return;
  }
  log(`downloading ${m.version} (${channel})`);
  const bundle = await CapacitorUpdater.download({ url: m.url, version: m.version, checksum: m.checksum, sessionKey: m.sessionKey });
  if (pending && pending.id !== bundle.id) void CapacitorUpdater.delete({ id: pending.id }).catch(() => {});
  write(K.pending, { id: bundle.id, version: m.version, native: m.native } satisfies Pending);
  await applyPending("downloaded");
}

/** Check the channel (one check at a time; failures just wait for the next). */
export function check(): Promise<void> {
  checking ??= checkNow()
    .catch((e) => log("check failed", e))
    .finally(() => {
      checking = null;
    });
  return checking;
}

/** Before the first render, at most this long: a stuck plugin must never
 * keep the app from starting. */
const LAUNCH_MS = 2500;

/** Before the first render (entry.client waits for it): settle the last
 * switch, and switch now to a bundle downloaded last time (the page
 * reloads; nothing old is shown). Never throws. */
export function launch(): Promise<void> {
  return Promise.race([launchNow().catch((e) => log("launch failed", e)), new Promise<void>((done) => setTimeout(done, LAUNCH_MS))]);
}

async function launchNow(): Promise<void> {
  const outcome = bootOutcome(read<string>(K.applying), BUILD.version);
  if (outcome === "rolled-back") {
    const bad = read<string>(K.applying)!;
    log(`${bad} failed to start and was rolled back`);
    write(K.failed, rememberFailed(read<string[]>(K.failed) ?? [], bad));
  }
  write(K.applying, null);
  if (!usablePending()) return;
  // This boot got this far: don't let the native side roll it back for
  // switching before it rendered
  await CapacitorUpdater.notifyAppReady();
  if (await applyPending("launch")) {
    // Reloading: hold the old bundle's first render back a moment
    await new Promise((r) => setTimeout(r, 2000));
  }
}

let started = false;

/** After the first render: this bundle works — tell the native side, then
 * check now and on every resume. */
export function appBooted() {
  if (started) return;
  started = true;
  void CapacitorUpdater.notifyAppReady().catch((e) => log("notifyAppReady failed", e));
  const touch = () => {
    touched = true;
  };
  window.addEventListener("pointerdown", touch, { capture: true, passive: true });
  window.addEventListener("keydown", touch, { capture: true });
  // Back to the front: Capacitor's `resume` (and visibilitychange, which
  // WKWebView also sends) — once per return
  let lastFront = 0;
  const front = () => {
    if (Date.now() - lastFront < 1000) return;
    lastFront = Date.now();
    touched = false;
    void applyPending("resume").then((switched) => {
      if (!switched) void check();
    });
  };
  document.addEventListener("resume", front);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") front();
  });
  void check();
}
