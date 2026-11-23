// Native fingerprint (#19): what a web bundle needs from the native shell.
//
// A web bundle may call native plugin code; an OTA bundle must only reach
// apps whose native build has exactly that code. The fingerprint is a hash
// of every runtime dependency of apps/mobile (Capacitor itself and each
// plugin, at its installed version), capacitor.config.ts (comments and
// whitespace aside) and the OTA public key it embeds — the native build's
// whole contract with the web code.
//
// The web build compiles it in (vite.config.ts) and writes it into
// build/client/ota-build.json; the publisher puts it in the manifest; the
// app takes a bundle only when it equals its own (packages/shared ota.ts
// `decide`). Add or bump a plugin, or change the shell config, and new
// bundles wait for a native build that has the change.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const MOBILE = path.resolve(import.meta.dirname, "..");

/** `name@version` of each runtime dependency of apps/mobile, sorted. */
export function nativePlugins(mobileDir = MOBILE) {
  const pkg = JSON.parse(fs.readFileSync(path.join(mobileDir, "package.json"), "utf8"));
  return Object.keys(pkg.dependencies ?? {})
    .sort()
    .map((name) => {
      const file = path.join(mobileDir, "node_modules", name, "package.json");
      if (!fs.existsSync(file)) throw new Error(`native-fingerprint: ${name} is not installed in apps/mobile (pnpm install)`);
      return `${name}@${JSON.parse(fs.readFileSync(file, "utf8")).version}`;
    });
}

/** capacitor.config.ts without comments or whitespace runs. */
export function normalizedConfig(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function fingerprintOf(plugins, configText, publicKey = "") {
  const h = createHash("sha256");
  h.update(plugins.join("\n"));
  h.update("\n--\n");
  h.update(normalizedConfig(configText));
  h.update("\n--\n");
  h.update(publicKey.trim());
  return h.digest("hex").slice(0, 16);
}

export function nativeFingerprint(mobileDir = MOBILE) {
  const plugins = nativePlugins(mobileDir);
  const config = fs.readFileSync(path.join(mobileDir, "capacitor.config.ts"), "utf8");
  const keyFile = path.join(mobileDir, "ota-public-key.pem");
  const key = fs.existsSync(keyFile) ? fs.readFileSync(keyFile, "utf8") : "";
  return { fingerprint: fingerprintOf(plugins, config, key), plugins };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { fingerprint, plugins } = nativeFingerprint();
  console.log(fingerprint);
  for (const p of plugins) console.log(`  ${p}`);
}
