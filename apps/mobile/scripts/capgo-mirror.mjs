// What @capgo/capacitor-updater's iOS code does with a downloaded bundle
// (CryptoCipher.swift, RSA.swift, CapgoUpdater.downloadZip), re-done in
// Node so tests and the OTA simulation (e2e/ota-sim.mjs) check our bundles
// the way the phone will: raw RSA recovery + PKCS#1 type-1 unpadding of the
// session key and checksum, AES-128-CBC decrypt, then SHA-256 compare.
import { constants, createDecipheriv, createHash, publicDecrypt } from "node:crypto";

/** RSA.swift `decrypt`: raw public-key op, then RFC 8017 type-1 unpadding. */
export function capgoRecover(publicPem, data) {
  const block = publicDecrypt({ key: publicPem, padding: constants.RSA_NO_PADDING }, data);
  if (block.length !== 256 || block[0] !== 0 || block[1] !== 1) return null;
  let i = 2;
  while (i < block.length && block[i] === 0xff) i++;
  if (i < 10 || i >= block.length - 1 || block[i] !== 0) return null;
  return block.subarray(i + 1);
}

/** Decrypt with the session key, then verify the signed checksum. Returns
 * the plain zip; throws like the plugin refuses. */
export function capgoVerify(publicPem, { data, checksum, sessionKey }) {
  const [ivB64, keyB64] = String(sessionKey).split(":");
  const iv = Buffer.from(ivB64 ?? "", "base64");
  const aes = capgoRecover(publicPem, Buffer.from(keyB64 ?? "", "base64"));
  if (iv.length !== 16 || aes?.length !== 16) throw new Error("bad session key");
  const d = createDecipheriv("aes-128-cbc", aes, iv);
  const zip = Buffer.concat([d.update(data), d.final()]);
  const expected = capgoRecover(publicPem, Buffer.from(checksum, "hex"));
  if (!expected || expected.length !== 32) throw new Error("bad checksum");
  const actual = createHash("sha256").update(zip).digest("hex");
  if (actual !== expected.toString("hex")) throw new Error("checksum mismatch");
  return zip;
}
