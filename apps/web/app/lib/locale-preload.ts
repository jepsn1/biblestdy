/**
 * Danish chunk preload (#209): most readers are Danish, and their strings are
 * a lazy chunk the app only asks for once its code runs. The build's
 * index.html (vite.config `localePreload`) gets this inline script, which
 * starts that download in parallel with the app's own JS instead.
 * Import-free: also loaded by vite.config at build time.
 */

/** The UI language a device starts in — i18n.ts uses this too, and the
 * inline script embeds its source, so both always agree. */
export function pickUiLanguage(stored: string | null, browser: string | undefined): "en" | "da" {
  if (stored === "da" || stored === "en") return stored;
  return browser?.toLowerCase().startsWith("da") ? "da" : "en";
}

/** Inline script: modulepreload `href` if this device will start in Danish. */
export function localePreloadScript(href: string): string {
  return `try{if((${pickUiLanguage.toString()})(localStorage.getItem("uiLanguage"),navigator.language)==="da"){var l=document.createElement("link");l.rel="modulepreload";l.href=${JSON.stringify(href)};document.head.appendChild(l)}}catch(e){}`;
}
