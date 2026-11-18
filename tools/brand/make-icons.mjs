// Tab + home-screen icons from one source (#250). Writes apps/web/public/
// favicon.svg, favicon.ico, apple-touch-icon.png, pwa-192.png, pwa-512.png,
// pwa-maskable-512.png. The in-app mark lives in apps/web/app/components/logo.tsx
// — keep MARK below in step with it (same paths; tiles use a bolder stroke).
// Needs Playwright (not a repo dependency). From a scratch dir:
//   npm i playwright && node /path/to/tools/brand/make-icons.mjs
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const BG = "#211d18"; // dark tile, as before (theme-color)
const GOLD = "#d9b36a";
const out = path.resolve(import.meta.dirname, "../../apps/web/public");

// 24-unit mark: stem (flat top), bowl, notched ribbon. Bbox centre ≈ (12.1, 13.1).
const MARK = (sw) =>
  `<path d="M7 3.2V18.6" fill="none" stroke="${GOLD}" stroke-width="${sw}"/>` +
  `<path d="M7 12.4C7 9.8 9.1 8 11.9 8 15 8 17.2 10.3 17.2 13.3 17.2 16.3 15 18.6 11.9 18.6H7" fill="none" stroke="${GOLD}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>` +
  `<path d="M11 18.6H14V23L12.5 21 11 23Z" fill="${GOLD}"/>`;

/** A tile `size` px square; the mark's 24-unit box spans `scale` of it, centred on its bbox. */
const tile = (size, { scale, rx = 0 }) => {
  const k = (size * scale) / 24;
  const tx = size / 2 - 12.1 * k;
  const ty = size / 2 - 13.1 * k;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" rx="${rx}" fill="${BG}"/><g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${k.toFixed(4)})">${MARK(2.4)}</g></svg>`;
};

// Tab icon, pixel-fitted on a 16 grid (panel: whole-pixel 2px stem + bowl,
// a plain 2px ribbon tab — the notch can't survive 16px). Crisp at 32 too.
const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="3.5" fill="${BG}"/><path fill="${GOLD}" fill-rule="evenodd" d="M4 2h2v4h3.5A2.5 2.5 0 0 1 12 8.5v2A2.5 2.5 0 0 1 9.5 13H4ZM6 8v3h3a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1ZM8 13h2v2H8Z"/></svg>`;

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
async function png(svg, size) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>*{margin:0}body{background:transparent}</style><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}" width="${size}" height="${size}" style="display:block">`);
  await page.waitForFunction(() => document.images[0].complete);
  return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}

fs.writeFileSync(path.join(out, "favicon.svg"), FAVICON);
// iOS masks its own corners: full bleed, no transparency
fs.writeFileSync(path.join(out, "apple-touch-icon.png"), await png(tile(180, { scale: 0.7 }), 180));
fs.writeFileSync(path.join(out, "pwa-192.png"), await png(tile(192, { scale: 0.7, rx: 42 }), 192));
fs.writeFileSync(path.join(out, "pwa-512.png"), await png(tile(512, { scale: 0.7, rx: 112 }), 512));
// Maskable: full bleed, mark well inside the 80 % safe circle
fs.writeFileSync(path.join(out, "pwa-maskable-512.png"), await png(tile(512, { scale: 0.62 }), 512));

// favicon.ico: PNG-in-ICO, 16 + 32 (pixel-fitted) + 48
const images = [
  [16, await png(FAVICON, 16)],
  [32, await png(FAVICON, 32)],
  [48, await png(tile(48, { scale: 0.75, rx: 10 }), 48)],
];
const head = Buffer.alloc(6 + 16 * images.length);
head.writeUInt16LE(0, 0);
head.writeUInt16LE(1, 2);
head.writeUInt16LE(images.length, 4);
let offset = head.length;
images.forEach(([size, data], i) => {
  const e = 6 + 16 * i;
  head.writeUInt8(size, e);
  head.writeUInt8(size, e + 1);
  head.writeUInt16LE(1, e + 4); // planes
  head.writeUInt16LE(32, e + 6); // bpp
  head.writeUInt32LE(data.length, e + 8);
  head.writeUInt32LE(offset, e + 12);
  offset += data.length;
});
fs.writeFileSync(path.join(out, "favicon.ico"), Buffer.concat([head, ...images.map(([, d]) => d)]));
await browser.close();
console.log("icons written to", out);
