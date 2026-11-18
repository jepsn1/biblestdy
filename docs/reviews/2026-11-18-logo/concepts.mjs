// Mark bodies in a 24-unit grid, drawn with currentColor.
// sw = stroke width in-app; fsw = bolder stroke for the 32px favicon tile.
export const concepts = {
  A: {
    name: "A · Ribboned book",
    idea: "The current tab icon (gold open book) kept, plus a ribbon marker hanging from the right page: 'your place is kept'. Continuity with what users already have on their home screens.",
    body: (sw) => `<g fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"><path d="M12 6.6C9.7 5.1 6.9 4.6 3.6 5V17.6C6.9 17.2 9.7 17.7 12 19.2Z"/><path d="M12 6.6C14.3 5.1 17.1 4.6 20.4 5V17.6C17.1 17.2 14.3 17.7 12 19.2Z"/></g><path d="M15.2 5.6H18.2V21.6L16.7 20 15.2 21.6Z" fill="currentColor"/>`,
  },
  B: {
    name: "B · Pen ring",
    idea: "A hand-drawn pen loop circling a line of text: the margin-scribing gesture the app is built around (circle a word, bracket a verse). Not a book at all.",
    body: (sw) => `<g transform="rotate(-14 12 12)" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"><path d="M16.6 6.1C11.9 4.7 5.4 6.3 4 10.5 2.7 14.5 7.5 18.5 13.3 17.6 18.7 16.8 21.5 13 20 9.4 19.1 7.3 16.8 5.6 13.8 4.6"/><path d="M8.4 12.1H15.6"/></g>`,
  },
  C: {
    name: "C · b with ribbon",
    idea: "A lowercase 'b' monogram whose bowl ends in a forked ribbon marker — a letter you can own at 16px, echoing the wordmark's first letter.",
    body: (sw) => `<g fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3.2V18.4"/><path d="M7 12.4C7 9.8 9.1 8 11.9 8 15 8 17.2 10.3 17.2 13.3 17.2 16.3 15 18.6 11.9 18.6H7"/></g><path d="M12.4 17.4H15.2V22.4L13.8 21 12.4 22.4Z" fill="currentColor"/>`,
  },
  D: {
    name: "D · Highlighted page",
    idea: "A page with three lines, the middle one under a marker wash: highlighting, the most-used study tool. Reads as 'a document you mark up'.",
    body: (sw) => `<path d="M7 10.6H17.4V14.6H7Z" fill="currentColor" opacity=".38"/><g fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3.4H14.6L19 7.8V20.6H5Z"/><path d="M14.4 3.6V8H18.8"/><path d="M8.2 12.6H15.8M8.2 16.8H13.4"/></g>`,
  },
};

export const markSvg = (k, sw = 2, attrs = "") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" ${attrs}>${concepts[k].body(sw)}</svg>`;

// Favicon / app tile: dark tile, gold mark. pad = margin in 32 units.
export const tileSvg = (k, { sw = 2.6, rx = 7, scale = 1, bg = "#211d18", fg = "#d9b36a" } = {}) => {
  const s = (24 / 32) * scale; // mark occupies 24/32 of the tile * scale
  const off = (32 - 32 * s) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="${rx}" fill="${bg}"/><g transform="translate(${off} ${off}) scale(${(32 * s) / 24})" color="${fg}">${concepts[k].body(sw)}</g></svg>`;
};

// Refined winner (panel 2026-11-18): butt-capped stem, plumb ribbon with a 2-unit notch.
export const finalBody = (sw) => `<path d="M7 3.2V18.6" fill="none" stroke="currentColor" stroke-width="${sw}"/><path d="M7 12.4C7 9.8 9.1 8 11.9 8 15 8 17.2 10.3 17.2 13.3 17.2 16.3 15 18.6 11.9 18.6H7" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"/><path d="M11 18.6H14V23L12.5 21 11 23Z" fill="currentColor"/>`;
// Pixel-fitted 16-grid tab icon: whole-pixel stem/bowl, 2px tab instead of the fork.
export const fav16 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="3.5" fill="#211d18"/><path fill="#d9b36a" fill-rule="evenodd" d="M4 2h2v4h3.5A2.5 2.5 0 0 1 12 8.5v2A2.5 2.5 0 0 1 9.5 13H4ZM6 8v3h3a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1ZM8 13h2v2H8Z"/></svg>`;
