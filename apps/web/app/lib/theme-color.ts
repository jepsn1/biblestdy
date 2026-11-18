/**
 * The status bar's colour follows the page (#251, Apple HIG: the status bar
 * area shows the app's own background). iOS paints a home-screen app's
 * status bar — and Safari / Android Chrome their bars — with `theme-color`;
 * the static one in root.tsx is the dark brand colour, so on light Paper /
 * Clean the bar would be a dark strip over a cream page. Kept in step with
 * <html>'s classes (theme, reader style), whoever changes them.
 */

/** "#rrggbb" for an sRGB pixel. */
export function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;
}

let ctx: CanvasRenderingContext2D | null | undefined;

/** Any CSS colour (oklch included) as hex, via a 1px canvas; null if it can't. */
function hexOf(color: string): string | null {
  if (ctx === undefined) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    ctx = canvas.getContext("2d", { willReadFrequently: true });
  }
  if (!ctx) return null;
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = "#000";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  return a === 255 ? toHex(r, g, b) : null;
}

export function syncThemeColor() {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta || !document.body) return;
  const hex = hexOf(getComputedStyle(document.body).backgroundColor);
  if (hex && meta.content !== hex) meta.content = hex;
}

/** Sync now and on every class change on <html>; returns the cleanup. */
export function watchThemeColor(): () => void {
  if (typeof MutationObserver === "undefined") return () => {};
  syncThemeColor();
  const observer = new MutationObserver(syncThemeColor);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}
