import type { CapacitorConfig } from "@capacitor/cli";
import { KeyboardResize } from "@capacitor/keyboard";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The OTA signing key's public half (#19): native code checks every
// downloaded bundle against it. Private half: on the server only.
const otaPublicKey = readFileSync(join(__dirname, "ota-public-key.pem"), "utf8").trim();

const config: CapacitorConfig = {
  appId: "com.biblestdy.app",
  appName: "biblestdy",
  // Populated from apps/web/build/client by scripts/copy-www.sh (`pnpm sync`)
  webDir: "www",
  server: {
    // Serve the bundle from https://localhost on Android so secure-context
    // APIs and cookies behave; API calls target prod (see web's api-base.ts).
    androidScheme: "https",
  },
  plugins: {
    Keyboard: {
      // The keyboard lies over the web view, as in Safari (#273): "native"
      // shrinks the web view only after the keyboard has finished sliding
      // (a jump once it's up) and re-lays the paginated reader under a
      // note each time. The app fits itself to the keyboard from the
      // plugin's events instead (apps/web/app/lib/native-shell.ts). The
      // accessory bar (‹ › ✓) is hidden from launch (#256).
      resize: KeyboardResize.None,
    },
    // Self-hosted OTA (#19, docs/MOBILE.md): the web code drives it
    // (apps/web/app/lib/ota) — no Capgo cloud. It checks the signed channel
    // manifest at https://biblestdy.com/ota/ on launch and resume, downloads,
    // and switches bundles only at a safe moment. A bundle that doesn't call
    // notifyAppReady within appReadyTimeout is rolled back natively.
    CapacitorUpdater: {
      autoUpdate: false,
      directUpdate: false,
      appReadyTimeout: 15000,
      // A new native build (CFBundleVersion) starts again from its own web build
      resetWhenUpdate: true,
      autoDeleteFailed: true,
      autoDeletePrevious: true,
      keepUrlPathAfterReload: true,
      httpsOnly: true,
      // Bundles are encrypted + their checksum signed for this key; the
      // plugin refuses any that isn't
      publicKey: otaPublicKey,
      // Nothing goes to Capgo's servers
      updateUrl: "",
      statsUrl: "",
      channelUrl: "",
      shakeMenu: false,
    },
  },
};

export default config;
