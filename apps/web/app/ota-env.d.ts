/** Compiled in by vite.config.ts (otaBuildInfo, #19). */
declare const __OTA_BUILD__: {
  /** This bundle's OTA version (`YYYYMMDD.HHMMSS-sha7`, from its commit). */
  version: string;
  /** Native fingerprint it was built against (apps/mobile/scripts/native-fingerprint.mjs). */
  native: string;
  /** SPKI (base64) of the key channel manifests are signed with. */
  publicKey: string;
};

interface ImportMetaEnv {
  /** OTA channel of a native build (ios.yml): set only for the app's own web build. */
  readonly VITE_OTA_CHANNEL?: string;
  /** Where manifests live; default https://biblestdy.com. Local test builds only. */
  readonly VITE_OTA_ORIGIN?: string;
}
