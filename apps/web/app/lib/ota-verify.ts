import type { SignedManifest } from "@biblestdy/shared/ota";

/**
 * A channel manifest's signature (#19): RSASSA-PKCS1-v1_5 / SHA-256 over the
 * exact payload string, by the server's private key. `spki` is the public
 * key, base64 SPKI, compiled into the build (vite.config.ts). False on any
 * failure — the app then simply doesn't update.
 */
export async function verifyManifest(signed: SignedManifest, spki: string): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey("spki", fromBase64(spki), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    return await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, fromBase64(signed.signature), new TextEncoder().encode(signed.payload));
  } catch {
    return false;
  }
}

function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
