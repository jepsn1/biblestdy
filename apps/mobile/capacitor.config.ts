import type { CapacitorConfig } from "@capacitor/cli";
import { KeyboardResize } from "@capacitor/keyboard";

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
  },
};

export default config;
