#!/usr/bin/env node
// Revoke the "Created via API" Apple Development certificates that CI mints.
//
// Automatic signing on a hosted runner starts from an empty keychain, so every
// signed run asks Apple for a fresh development certificate. Apple caps those
// per team and the next run then fails ("Choose a certificate to revoke").
// Run this before `xcodebuild archive` so each run starts with room to spare.
// Only API-minted development certs are touched — anything created by a person
// in Xcode or the developer portal, and every distribution cert, is left alone.
//
// Env: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH (path to AuthKey_<id>.p8).
// Flags: --dry-run lists what would be revoked without revoking it.
// No dependencies: Node's crypto signs the ES256 JWT the API wants.
import crypto from "node:crypto";
import fs from "node:fs";

const API = "https://api.appstoreconnect.apple.com/v1";
const DEV_TYPES = new Set(["DEVELOPMENT", "IOS_DEVELOPMENT"]);
const MINTED = /Created via API/i;
const dryRun = process.argv.includes("--dry-run");

const { ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH } = process.env;
if (!ASC_KEY_ID || !ASC_ISSUER_ID || !ASC_KEY_PATH) {
  console.error("prune-ci-certs: ASC_KEY_ID, ASC_ISSUER_ID and ASC_KEY_PATH are required");
  process.exit(1);
}

const b64url = (v) => Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString("base64url");

function token() {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url({ alg: "ES256", kid: ASC_KEY_ID, typ: "JWT" });
  const body = b64url({ iss: ASC_ISSUER_ID, iat: now, exp: now + 15 * 60, aud: "appstoreconnect-v1" });
  const key = crypto.createPrivateKey(fs.readFileSync(ASC_KEY_PATH, "utf8"));
  const sig = crypto.sign("sha256", Buffer.from(`${head}.${body}`), { key, dsaEncoding: "ieee-p1363" });
  return `${head}.${body}.${sig.toString("base64url")}`;
}

const auth = { Authorization: `Bearer ${token()}` };

async function api(method, url) {
  const res = await fetch(url, { method, headers: auth });
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

const minted = [];
for (let url = `${API}/certificates?limit=200`; url; ) {
  const page = await api("GET", url);
  for (const c of page.data) {
    const { certificateType, name = "", displayName = "" } = c.attributes;
    if (DEV_TYPES.has(certificateType) && (MINTED.test(name) || MINTED.test(displayName))) {
      minted.push({ id: c.id, label: `${name} (${certificateType}, expires ${c.attributes.expirationDate})` });
    }
  }
  url = page.links?.next;
}

console.log(`${minted.length} CI-minted development certificate(s)`);
for (const c of minted) {
  console.log(`${dryRun ? "would revoke" : "revoking"} ${c.id}: ${c.label}`);
  if (!dryRun) await api("DELETE", `${API}/certificates/${c.id}`);
}
