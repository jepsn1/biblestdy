import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import { localePreloadScript } from "./app/lib/locale-preload";
import { VitePWA } from "vite-plugin-pwa";

/** #209: index.html starts the Danish strings' download before the app's JS
 * runs (most readers are Danish). The client build names the hashed chunk;
 * after React Router writes the SPA shell, its <head> gets the inline script
 * from lib/locale-preload. Fails the build if the chunk can't be found. */
function localePreload(): Plugin {
  let href: string | undefined;
  let outDir: string | undefined;
  return {
    name: "biblestdy:locale-preload",
    apply: "build",
    generateBundle(_, bundle) {
      if (this.environment.name !== "client") return;
      const chunk = Object.values(bundle).find(
        (c) => c.type === "chunk" && c.facadeModuleId?.replaceAll("\\", "/").endsWith("/app/locales/da.ts"),
      );
      if (chunk?.type === "chunk" && chunk.imports.length === 0) {
        href = this.environment.config.base + chunk.fileName;
        outDir = path.resolve(this.environment.config.root, this.environment.config.build.outDir);
      }
    },
    buildApp: {
      order: "post", // after React Router's buildApp has written index.html
      async handler() {
        if (!href || !outDir) throw new Error("locale-preload: no self-contained Danish chunk (app/locales/da.ts) in the client build");
        const file = path.join(outDir, "index.html");
        const html = fs.readFileSync(file, "utf8");
        const anchor = '<meta charSet="utf-8"/>';
        if (!html.includes(anchor)) throw new Error(`locale-preload: ${anchor} not in index.html`);
        fs.writeFileSync(file, html.replace(anchor, `${anchor}<script>${localePreloadScript(href)}</script>`));
      },
    },
  };
}

export default defineConfig({
  plugins: [
    tailwindcss(),
    reactRouter(),
    localePreload(),
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
