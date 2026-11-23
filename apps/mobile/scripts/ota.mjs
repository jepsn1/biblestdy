#!/usr/bin/env node
// OTA bundles for the app (#19) — publish, promote, rollback, status.
// Operator guide: docs/MOBILE.md "Over-the-air updates".
//
//   node apps/mobile/scripts/ota.mjs keygen            once: signing key pair
//   node apps/mobile/scripts/ota.mjs publish [--channel dev] [--from apps/web/build/client]
//   node apps/mobile/scripts/ota.mjs promote [--version V]        dev → stable
//   node apps/mobile/scripts/ota.mjs rollback --channel C [--to V]
//   node apps/mobile/scripts/ota.mjs status
//
// Env: OTA_DIR (default <repo>/ota, served by Caddy at /ota/ from its
// public/ dir), OTA_BASE_URL (default https://biblestdy.com/ota),
// OTA_SIGNING_KEY (default ~/.config/biblestdy/ota-signing-key.pem — the
// private key; never in the repo), OTA_PUBLIC_KEY (tests only).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { emptyState, isOtaChannel, manifestFor, promote, prunable, dropBundles, publish, rollback, currentVersion } from "@biblestdy/shared/ota";
import { encryptBundle, generateKeys, publicPemOf, readState, signManifest, withLock, writeAtomic, writeState, zipDir } from "./ota-lib.mjs";
import { nativeFingerprint } from "./native-fingerprint.mjs";

const MOBILE = path.resolve(import.meta.dirname, "..");
const REPO = path.resolve(MOBILE, "../..");
const PUBLIC_KEY = path.resolve(process.env.OTA_PUBLIC_KEY || path.join(MOBILE, "ota-public-key.pem"));
const ROOT = path.resolve(process.env.OTA_DIR || path.join(REPO, "ota"));
const BASE_URL = process.env.OTA_BASE_URL || "https://biblestdy.com/ota";
const KEY = process.env.OTA_SIGNING_KEY || path.join(os.homedir(), ".config/biblestdy/ota-signing-key.pem");

const [cmd, ...rest] = process.argv.slice(2);
const { values: args } = parseArgs({
  args: rest,
  options: {
    channel: { type: "string" },
    from: { type: "string" },
    version: { type: "string" },
    to: { type: "string" },
    force: { type: "boolean" },
  },
});

const now = () => new Date().toISOString();
const die = (msg) => {
  console.error(`ota: ${msg}`);
  process.exit(1);
};

function channelArg(fallback) {
  const c = args.channel ?? fallback;
  if (!isOtaChannel(c)) die(`--channel must be dev or stable${c ? `, got "${c}"` : ""}`);
  return c;
}

/** The private key, checked against the public key the app is built with —
 * a mismatch would publish bundles every installed app refuses. */
function signingKey() {
  if (!fs.existsSync(KEY)) die(`no signing key at ${KEY} (run \`ota.mjs keygen\` once, or set OTA_SIGNING_KEY)`);
  const key = fs.readFileSync(KEY, "utf8");
  if (!fs.existsSync(PUBLIC_KEY)) die(`no ${path.relative(REPO, PUBLIC_KEY)} in the repo`);
  if (publicPemOf(key).trim() !== fs.readFileSync(PUBLIC_KEY, "utf8").trim()) {
    die(`${KEY} does not match ${path.relative(REPO, PUBLIC_KEY)} — the app would refuse every bundle`);
  }
  return key;
}

function writeManifest(state, channel, key) {
  const m = manifestFor(state, channel, BASE_URL, Date.now());
  if (!m) return null;
  writeAtomic(path.join(ROOT, "public", `${channel}.json`), `${JSON.stringify(signManifest(m, key))}\n`);
  return m;
}

function prune(state) {
  const gone = prunable(state);
  for (const v of gone) fs.rmSync(path.join(ROOT, "public", state.bundles[v].file), { force: true });
  return dropBundles(state, gone);
}

function keygen() {
  if (fs.existsSync(KEY) && !args.force) die(`${KEY} exists — keep it (installed apps trust its public key); --force replaces it`);
  const { privateKey, publicKey } = generateKeys();
  fs.mkdirSync(path.dirname(KEY), { recursive: true, mode: 0o700 });
  fs.writeFileSync(KEY, privateKey, { mode: 0o600 });
  fs.writeFileSync(PUBLIC_KEY, publicKey);
  console.log(`private key: ${KEY} (0600 — back it up; losing it means a new native build)`);
  console.log(`public key:  ${path.relative(REPO, PUBLIC_KEY)} — commit it, then sync + build the app`);
}

function publishCmd() {
  const channel = channelArg("dev");
  const from = path.resolve(args.from ?? path.join(REPO, "apps/web/build/client"));
  const infoFile = path.join(from, "ota-build.json");
  if (!fs.existsSync(path.join(from, "index.html"))) die(`no index.html in ${from} — build web first`);
  if (!fs.existsSync(infoFile)) die(`no ota-build.json in ${from} (the web build writes it)`);
  const info = JSON.parse(fs.readFileSync(infoFile, "utf8"));
  const key = signingKey();
  withLock(ROOT, () => {
    let state = readState(ROOT, emptyState);
    const previous = currentVersion(state, channel);
    // A version is a commit: built again (another deploy of it), the bundle
    // already published for it stands.
    let bundle = state.bundles[info.version];
    if (!bundle) {
      const enc = encryptBundle(zipDir(from), key);
      const file = `bundles/${info.version}.zip`;
      writeAtomic(path.join(ROOT, "public", file), enc.data);
      bundle = {
        version: info.version,
        file,
        size: enc.data.length,
        sha256: enc.sha256,
        checksum: enc.checksum,
        sessionKey: enc.sessionKey,
        native: info.native,
        plugins: info.plugins,
        commit: info.commit,
        builtAt: info.builtAt,
      };
    }
    const r = publish(state, bundle, channel, now());
    state = prune(r.state);
    writeState(ROOT, state);
    const manifestMissing = !fs.existsSync(path.join(ROOT, "public", `${channel}.json`));
    if (r.changed || manifestMissing) writeManifest(state, channel, key);
    console.log(r.changed ? `ota: ${channel} → ${bundle.version} (${(bundle.size / 1024).toFixed(0)} KB)` : `ota: ${channel} already serves ${bundle.version}`);
    const before = previous && state.bundles[previous];
    if (before && before.native !== bundle.native) {
      console.warn(
        `ota: WARNING native fingerprint changed (${before.native} → ${bundle.native}): installed apps keep ${previous} until a new native build (TestFlight) is installed`,
      );
    }
  });
}

function promoteCmd() {
  const key = signingKey();
  withLock(ROOT, () => {
    const state = readState(ROOT, emptyState);
    const r = promote(state, now(), { version: args.version });
    writeState(ROOT, r.state);
    if (r.changed) writeManifest(r.state, "stable", key);
    console.log(r.changed ? `ota: stable → ${r.version}` : `ota: stable already serves ${r.version}`);
  });
}

function rollbackCmd() {
  const channel = channelArg();
  const key = signingKey();
  withLock(ROOT, () => {
    const state = readState(ROOT, emptyState);
    const r = rollback(state, channel, now(), args.to);
    writeState(ROOT, r.state);
    if (r.changed) writeManifest(r.state, channel, key);
    console.log(`ota: ${channel} → ${r.version}`);
  });
}

function status() {
  const state = readState(ROOT, emptyState);
  let here = null;
  try {
    here = nativeFingerprint().fingerprint;
  } catch {
    // not installed: just don't compare
  }
  console.log(`OTA store: ${ROOT}  (served as ${BASE_URL})`);
  if (here) console.log(`this checkout's native fingerprint: ${here}`);
  for (const c of ["dev", "stable"]) {
    const v = currentVersion(state, c);
    const b = v && state.bundles[v];
    console.log(`\n${c}: ${v ?? "(nothing published)"}${b ? `  native ${b.native}${here && b.native !== here ? " (≠ this checkout)" : ""}  commit ${b.commit}` : ""}`);
    const h = state.channels[c] ?? [];
    if (h.length > 1) console.log(`  earlier: ${h.slice(0, -1).reverse().slice(0, 5).join(", ")}`);
  }
  const last = state.log.slice(-5);
  if (last.length) {
    console.log("\nrecent:");
    for (const e of last) console.log(`  ${e.at}  ${e.action.padEnd(8)} ${e.channel.padEnd(6)} ${e.version}`);
  }
}

try {
  switch (cmd) {
    case "keygen":
      keygen();
      break;
    case "publish":
      publishCmd();
      break;
    case "promote":
      promoteCmd();
      break;
    case "rollback":
      rollbackCmd();
      break;
    case "status":
      status();
      break;
    default:
      die("usage: ota.mjs keygen | publish [--channel dev] [--from DIR] | promote [--version V] | rollback --channel C [--to V] | status");
  }
} catch (e) {
  die(e instanceof Error ? e.message : String(e));
}
