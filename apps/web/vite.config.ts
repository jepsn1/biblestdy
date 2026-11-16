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
      includeAssets: ["favicon.ico", "favicon.svg", "apple-touch-icon.png"],
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
    // Workspace package ships CJS; prebundle so named ESM imports work in dev.
    // The note editor + Prism are lazy imports (M8): list them so a cold dev
    // start doesn't find them late and reload the page on first note open
    // (the versification map too: lazy, at the first translation switch, #174; Compare translations, #167)
    include: ["@biblestdy/shared", "@biblestdy/shared/versification", "prismjs", "@mdxeditor/editor", "lexical"],
  },
  server: {
    // Reachable from LAN + via caddy at dev.biblestdy.com (basic_auth) — UFW blocks WAN
    host: true,
    allowedHosts: ["dev.biblestdy.com"],
    // Dev-only: forward API calls to the NestJS server
    proxy: {
      // API_PROXY: point a second dev server (e.g. a worktree on other ports) at its own API
      "/api": process.env.API_PROXY ?? "http://localhost:3001",
    },
  },
});
