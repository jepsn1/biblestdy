import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // `~/…` imports, as in the app
  resolve: { alias: { "~": fileURLToPath(new URL("./app", import.meta.url)) } },
  test: {
    // Pure reader modules only — no browser, no DB (house rule)
    include: ["app/**/*.test.ts"],
    environment: "node",
  },
});
