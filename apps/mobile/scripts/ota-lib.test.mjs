// The publisher's output, checked the way the app checks it (#19):
// - native side: capgo-mirror.mjs, the plugin's iOS verifier re-done in
//   Node — decrypt, then compare SHA-256;
// - web side: the manifest signature through WebCrypto, as lib/ota does;
// - the CLI against a temp store: publish, promote, rollback.
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { encryptBundle, generateKeys, publicPemOf, signManifest, spkiBase64, zipDir } from "./ota-lib.mjs";
import { fingerprintOf, normalizedConfig } from "./native-fingerprint.mjs";
import { capgoVerify } from "./capgo-mirror.mjs";

const keys = generateKeys();

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ota-test-"));
}

function fakeBuild(dir, info, marker = "one") {
  fs.mkdirSync(path.join(dir, "assets"), { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), `<!doctype html><p>${marker}</p>`);
  fs.writeFileSync(path.join(dir, "assets", "app.js"), `console.log(${JSON.stringify(marker)});`.repeat(50));
  fs.writeFileSync(path.join(dir, "ota-build.json"), JSON.stringify(info));
}

describe("zipDir", () => {
  it("is a real zip with every file, and the same bytes every time", () => {
    const dir = tmp();
    fakeBuild(dir, { version: "v1" });
    const a = zipDir(dir);
    expect(zipDir(dir).equals(a)).toBe(true);
    const file = path.join(tmp(), "b.zip");
    fs.writeFileSync(file, a);
    const out = tmp();
    execFileSync("unzip", ["-q", file, "-d", out]);
    expect(fs.readFileSync(path.join(out, "index.html"), "utf8")).toContain("<p>one</p>");
    expect(fs.readFileSync(path.join(out, "assets/app.js"), "utf8")).toBe(fs.readFileSync(path.join(dir, "assets/app.js"), "utf8"));
  });
});

describe("encryptBundle (capgo v2 wire format)", () => {
  const zip = Buffer.from("PK fake zip bytes ".repeat(100));
  it("the native verifier decrypts it and the checksum matches", () => {
    const enc = encryptBundle(zip, keys.privateKey);
    expect(enc.sha256).toBe(createHash("sha256").update(zip).digest("hex"));
    expect(enc.checksum).toMatch(/^[0-9a-f]{512}$/); // 256 bytes, hex — what CryptoCipher expects
    expect(capgoVerify(keys.publicKey, enc).equals(zip)).toBe(true);
  });
  it("is refused under another key", () => {
    const enc = encryptBundle(zip, generateKeys().privateKey);
    expect(() => capgoVerify(keys.publicKey, enc)).toThrow();
  });
  it("a tampered zip fails the checksum", () => {
    const enc = encryptBundle(zip, keys.privateKey);
    const other = encryptBundle(Buffer.from("evil"), keys.privateKey);
    expect(() => capgoVerify(keys.publicKey, { ...enc, data: other.data, sessionKey: other.sessionKey })).toThrow(/mismatch/);
  });
  it("public key is the PKCS#1 PEM capgo wants", () => {
    expect(keys.publicKey.startsWith("-----BEGIN RSA PUBLIC KEY-----")).toBe(true);
    expect(publicPemOf(keys.privateKey)).toBe(keys.publicKey);
  });
});

describe("signManifest", () => {
  const verify = async (spki, { payload, signature }) => {
    const key = await crypto.subtle.importKey("spki", Buffer.from(spki, "base64"), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    return crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, Buffer.from(signature, "base64"), new TextEncoder().encode(payload));
  };
  it("verifies in WebCrypto with the SPKI key the web build compiles in", async () => {
    const signed = signManifest({ schema: 1, version: "v1" }, keys.privateKey);
    expect(JSON.parse(signed.payload)).toEqual({ schema: 1, version: "v1" });
    expect(await verify(spkiBase64(keys.publicKey), signed)).toBe(true);
    expect(await verify(spkiBase64(keys.publicKey), { ...signed, payload: signed.payload.replace("v1", "v2") })).toBe(false);
    expect(await verify(spkiBase64(generateKeys().publicKey), signed)).toBe(false);
  });
});

describe("native fingerprint", () => {
  const plugins = ["@capacitor/core@8.5.1", "@capgo/capacitor-updater@8.54.2"];
  it("ignores comments and whitespace in the config, not its contents", () => {
    const a = "const c = {\n  // why\n  appId: 'x', /* note */\n};";
    expect(normalizedConfig(a)).toBe("const c = { appId: 'x', };");
    expect(fingerprintOf(plugins, a)).toBe(fingerprintOf(plugins, "const c = { appId: 'x', };"));
    expect(fingerprintOf(plugins, a)).not.toBe(fingerprintOf(plugins, "const c = { appId: 'y', };"));
  });
  it("changes with any plugin version or the key", () => {
    const base = fingerprintOf(plugins, "c", "k");
    expect(fingerprintOf(["@capacitor/core@8.5.2", plugins[1]], "c", "k")).not.toBe(base);
    expect(fingerprintOf(plugins.slice(0, 1), "c", "k")).not.toBe(base);
    expect(fingerprintOf(plugins, "c", "k2")).not.toBe(base);
  });
});

describe("ota.mjs CLI", () => {
  const cli = path.join(import.meta.dirname, "ota.mjs");
  const work = tmp();
  const store = path.join(work, "ota");
  const keyFile = path.join(work, "key.pem");
  const pubFile = path.join(work, "pub.pem");
  fs.writeFileSync(keyFile, keys.privateKey);
  fs.writeFileSync(pubFile, keys.publicKey);
  const env = { ...process.env, OTA_DIR: store, OTA_SIGNING_KEY: keyFile, OTA_PUBLIC_KEY: pubFile, OTA_BASE_URL: "https://example.test/ota" };
  const run = (...a) => execFileSync(process.execPath, [cli, ...a], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const manifest = (c) => {
    const signed = JSON.parse(fs.readFileSync(path.join(store, "public", `${c}.json`), "utf8"));
    return JSON.parse(signed.payload);
  };
  const build = (version, marker, native = "n1") => {
    const dir = path.join(work, `build-${version}`);
    fakeBuild(dir, { version, native, plugins: [], commit: "abc1234", builtAt: "2026-11-23T00:00:00Z" }, marker);
    return dir;
  };

  it("publish → dev only; the bundle on disk passes the native check", () => {
    expect(run("publish", "--channel", "dev", "--from", build("v1", "one"))).toMatch(/dev → v1/);
    const m = manifest("dev");
    expect(m).toMatchObject({ channel: "dev", version: "v1", url: "https://example.test/ota/bundles/v1.zip", native: "n1" });
    expect(fs.existsSync(path.join(store, "public", "stable.json"))).toBe(false);
    const data = fs.readFileSync(path.join(store, "public", "bundles", "v1.zip"));
    expect(data.length).toBe(m.size);
    const zip = capgoVerify(keys.publicKey, { data, checksum: m.checksum, sessionKey: m.sessionKey });
    const out = path.join(work, "unz");
    fs.writeFileSync(path.join(work, "v1.zip"), zip);
    execFileSync("unzip", ["-q", path.join(work, "v1.zip"), "-d", out]);
    expect(fs.readFileSync(path.join(out, "index.html"), "utf8")).toContain("one");
  });

  it("publishing the same version again is a no-op", () => {
    const before = fs.readFileSync(path.join(store, "public", "dev.json"), "utf8");
    expect(run("publish", "--from", build("v1", "one"))).toMatch(/already serves v1/);
    expect(fs.readFileSync(path.join(store, "public", "dev.json"), "utf8")).toBe(before);
  });

  it("stable is untouched until promote; promote copies dev", () => {
    run("publish", "--from", build("v2", "two"));
    expect(manifest("dev").version).toBe("v2");
    expect(fs.existsSync(path.join(store, "public", "stable.json"))).toBe(false);
    expect(run("promote")).toMatch(/stable → v2/);
    expect(manifest("stable").version).toBe("v2");
  });

  it("rollback restores the prior bundle and re-signs with a newer seq", () => {
    run("publish", "--from", build("v3", "three"));
    const seq = manifest("dev").seq;
    expect(run("rollback", "--channel", "dev")).toMatch(/dev → v2/);
    expect(manifest("dev").version).toBe("v2");
    expect(manifest("dev").seq).toBeGreaterThanOrEqual(seq);
    expect(manifest("stable").version).toBe("v2");
    expect(run("rollback", "--channel", "dev", "--to", "v3")).toMatch(/dev → v3/);
  });

  it("warns when the native fingerprint changes", () => {
    const r = spawnSync(process.execPath, [cli, "publish", "--from", build("v4", "four", "n2")], { env, encoding: "utf8" });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/dev → v4/);
    expect(r.stderr).toMatch(/native fingerprint changed \(n1 → n2\)/);
  });

  it("refuses a signing key that doesn't match the app's public key", () => {
    const other = path.join(work, "other.pem");
    fs.writeFileSync(other, generateKeys().privateKey);
    expect(() =>
      execFileSync(process.execPath, [cli, "publish", "--from", build("v5", "five")], { env: { ...env, OTA_SIGNING_KEY: other }, stdio: "pipe" }),
    ).toThrow(/does not match/);
  });

  it("status lists the channels", () => {
    const s = run("status");
    expect(s).toMatch(/dev: v4/);
    expect(s).toMatch(/stable: v2/);
  });
});
