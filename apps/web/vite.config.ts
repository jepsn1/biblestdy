import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  resolve: {
    tsconfigPaths: true,
  },
  optimizeDeps: {
    // Workspace package ships CJS; prebundle so named ESM imports work in dev
    include: ["@biblestdy/shared"],
  },
  server: {
    // Reachable from LAN + via caddy at dev.biblestdy.com (basic_auth) — UFW blocks WAN
    host: true,
    allowedHosts: ["dev.biblestdy.com"],
    // Dev-only: forward API calls to the NestJS server
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
});
