/**
 * Pre-paint text size (#61) for root.tsx's inline script. Its own module with
 * no imports: root is SSR'd, and @biblestdy/shared (CJS) can't load there.
 * The size list mirrors TEXT_SIZES — text-size.test.ts keeps them in sync.
 */
export const TEXT_SIZE_KEY = "textSize";

/** Every size except the 100% default (which needs no inline style). */
export const PREPAINT_SIZES = [125, 150, 175, 200];

export const TEXT_SIZE_PREPAINT = `try{var s=Number(localStorage.getItem("${TEXT_SIZE_KEY}"));if(${JSON.stringify(
  PREPAINT_SIZES,
)}.indexOf(s)>-1)document.documentElement.style.fontSize=s+"%"}catch(e){}`;
