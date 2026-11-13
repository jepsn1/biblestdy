/**
 * Pre-paint theme (#62) for root.tsx's inline script. Import-free (root is
 * SSR'd). "dark" → .dark; "system" follows the OS; anything else = Paper
 * light (the default). Key mirrors lib/theme.ts — theme.test.ts runs it.
 */
export const THEME_KEY = "theme";

export const THEME_PREPAINT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}catch(e){}`;
