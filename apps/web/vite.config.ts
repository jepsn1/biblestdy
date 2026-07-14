import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    tailwindcss(),
    reactRouter(),
    // Installable PWA (#13). NO offline per PRD: the service worker precaches
    // nothing and has no runtime caching — it exists only for installability.
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "apple-touch-icon.png"],
      manifest: {
        name: "biblestdy",
        short_name: "biblestdy",
        description: "Margin-scribing Bible study",
        start_url: "/",
        display: "standalone",
        background_color: "#f6f2e9",
        theme_color: "#211d18",
        icons: [
          { src: "/pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/pwa-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: [], // precache nothing
        navigateFallback: null, // never serve pages from the SW
      },
    }),
  ],
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
