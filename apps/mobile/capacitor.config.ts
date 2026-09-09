import type { CapacitorConfig } from "@capacitor/cli";

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
};

export default config;
