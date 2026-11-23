import { constants, generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyManifest } from "./ota-verify";

const pair = () =>
  generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "der" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

// Signed the way apps/mobile/scripts/ota-lib.mjs signManifest does
const signed = (payload: string, key: string) => ({
  payload,
  signature: sign("sha256", Buffer.from(payload), { key, padding: constants.RSA_PKCS1_PADDING }).toString("base64"),
});

describe("verifyManifest", () => {
  const { publicKey, privateKey } = pair();
  const spki = publicKey.toString("base64");
  const payload = JSON.stringify({ schema: 1, channel: "dev", version: "v1" });

  it("accepts the server's signature", async () => {
    expect(await verifyManifest(signed(payload, privateKey), spki)).toBe(true);
  });
  it("refuses an edited payload", async () => {
    const s = signed(payload, privateKey);
    expect(await verifyManifest({ ...s, payload: s.payload.replace("v1", "v2") }, spki)).toBe(false);
  });
  it("refuses another key's signature", async () => {
    expect(await verifyManifest(signed(payload, pair().privateKey), spki)).toBe(false);
  });
  it("refuses garbage without throwing", async () => {
    expect(await verifyManifest({ payload, signature: "%%%" }, spki)).toBe(false);
    expect(await verifyManifest(signed(payload, privateKey), "bm9wZQ==")).toBe(false);
  });
});
