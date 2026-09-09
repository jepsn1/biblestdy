import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Pure reader modules only — no browser, no DB (house rule)
    include: ["app/**/*.test.ts"],
    environment: "node",
  },
});
