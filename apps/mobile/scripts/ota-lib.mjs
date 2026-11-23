// OTA publisher internals (#19): zip, encrypt + sign, the on-disk store.
// The CLI is ota.mjs; the channel rules live in @biblestdy/shared/ota.
//
// Wire format = @capgo/capacitor-updater's "encryption v2", which the
// native updater checks itself before it unzips anything:
//   - the zip is AES-128-CBC encrypted with a fresh key + IV;
//   - sessionKey = base64(IV) ":" base64(RSA private-key-encrypt(AES key));
//   - checksum = hex(RSA private-key-encrypt(SHA-256 of the plain zip)).
// The app's native build holds the RSA public key (capacitor.config.ts), so
// only the holder of the private key can make a bundle it accepts. On top,
// each channel manifest is signed (RSASSA-PKCS1-v1_5 / SHA-256, same key),
// and the web code checks that before trusting any field.
import { constants, createCipheriv, createHash, createPrivateKey, createPublicKey, generateKeyPairSync, privateEncrypt, randomBytes, sign } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

// ---- keys -------------------------------------------------------------------

/** RSA-2048 key pair. The public half in the PKCS#1 PEM capgo expects. */
export function generateKeys() {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "pkcs1", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { privateKey, publicKey };
}

/** The PKCS#1 public PEM that belongs to a private key. */
export function publicPemOf(privatePem) {
  return createPublicKey(createPrivateKey(privatePem)).export({ type: "pkcs1", format: "pem" }).toString();
}

/** SPKI DER, base64 — what WebCrypto imports (the web build compiles it in). */
export function spkiBase64(publicPem) {
  return createPublicKey(publicPem).export({ type: "spki", format: "der" }).toString("base64");
}

// ---- zip --------------------------------------------------------------------

/** All files under `dir`, as forward-slash paths, sorted. */
export function listFiles(dir) {
  const out = [];
  const walk = (rel) => {
    for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(r);
      else if (e.isFile()) out.push(r);
    }
  };
  walk("");
  return out.sort();
}

/** A deterministic zip of `dir` (deflate, fixed timestamps, sorted): the
 * same build always zips to the same bytes, so the same checksum. */
export function zipDir(dir) {
  const DOS_TIME = 0;
  const DOS_DATE = (1 << 5) | 1; // 1980-01-01
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const rel of listFiles(dir)) {
    const data = fs.readFileSync(path.join(dir, rel));
    const name = Buffer.from(rel, "utf8");
    const deflated = zlib.deflateRawSync(data, { level: 9 });
    const stored = deflated.length >= data.length;
    const body = stored ? data : deflated;
    const crc = zlib.crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(stored ? 0 : 8, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, body);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(stored ? 0 : 8, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(centrals.length / 2, 8);
  end.writeUInt16LE(centrals.length / 2, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

// ---- encrypt + sign ---------------------------------------------------------

const sha256 = (buf) => createHash("sha256").update(buf).digest();

/** capgo v2: the encrypted zip plus the checksum and session key the native
 * updater needs to decrypt and verify it. */
export function encryptBundle(zip, privatePem) {
  const key = randomBytes(16);
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-128-cbc", key, iv);
  const data = Buffer.concat([cipher.update(zip), cipher.final()]);
  const rsa = (buf) => privateEncrypt({ key: privatePem, padding: constants.RSA_PKCS1_PADDING }, buf);
  const digest = sha256(zip);
  return {
    data,
    sha256: digest.toString("hex"),
    checksum: rsa(digest).toString("hex"),
    sessionKey: `${iv.toString("base64")}:${rsa(key).toString("base64")}`,
  };
}

/** `{ payload, signature }`: the manifest as a JSON string, and an RSA
 * signature over exactly those bytes. */
export function signManifest(manifest, privatePem) {
  const payload = JSON.stringify(manifest);
  const signature = sign("sha256", Buffer.from(payload, "utf8"), { key: privatePem, padding: constants.RSA_PKCS1_PADDING }).toString("base64");
  return { payload, signature };
}

// ---- the store --------------------------------------------------------------
//
//   <root>/state.json            channels + bundles (never served)
//   <root>/public/dev.json       signed manifests (served at /ota/*.json)
//   <root>/public/stable.json
//   <root>/public/bundles/<v>.zip

export function readState(root, empty) {
  const file = path.join(root, "state.json");
  if (!fs.existsSync(file)) return empty();
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/** Write via a temp file + rename, so a reader never sees half a file. */
export function writeAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

export function writeState(root, state) {
  writeAtomic(path.join(root, "state.json"), `${JSON.stringify(state, null, 2)}\n`);
}

/** One publisher at a time (two deploys at once must not interleave). */
export function withLock(root, fn) {
  fs.mkdirSync(root, { recursive: true });
  const lock = path.join(root, ".lock");
  try {
    fs.mkdirSync(lock);
  } catch {
    throw new Error(`another OTA command is running (remove ${lock} if it is stale)`);
  }
  try {
    return fn();
  } finally {
    fs.rmSync(lock, { recursive: true, force: true });
  }
}
