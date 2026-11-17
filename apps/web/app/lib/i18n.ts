import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "../locales/en";
import { pickUiLanguage } from "./locale-preload";

/** UI locale (issue #12) — independent of the Scripture translation. Sticky
 * per device; first visit follows the browser. Adding a locale = a new file
 * in app/locales + one line in LOADERS.
 *
 * English is the fallback and what the SPA shell prerenders, so it ships in
 * the first-paint bundle; every other locale is its own lazy chunk (#209,
 * bundle budget). The active one loads before hydration (entry.client awaits
 * `i18nReady`) and on a switch before the language flips — no frame ever
 * renders with the wrong or missing strings. A Danish device starts that
 * chunk's download from index.html already (lib/locale-preload). */
export type UiLanguage = "en" | "da";

const LOADERS: Record<Exclude<UiLanguage, "en">, () => Promise<{ default: typeof en }>> = {
  da: () => import("../locales/da"),
};

const initial: UiLanguage = pickUiLanguage(
  typeof localStorage !== "undefined" ? localStorage.getItem("uiLanguage") : null,
  typeof navigator !== "undefined" ? navigator.language : undefined,
);

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  // Start in English until the initial locale's chunk is in (normally before
  // hydration, so nothing renders in between)
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false }, // React escapes already
});

const loading = new Map<UiLanguage, Promise<void>>();

/** Fetches a locale's strings into i18next (once). Deep-merged without
 * overwriting, so bundles a lazy chunk added first (compare, tour) survive. */
export function loadUiLanguage(lng: UiLanguage): Promise<void> {
  if (lng === "en") return Promise.resolve();
  let p = loading.get(lng);
  if (!p) {
    p = LOADERS[lng]().then(
      (m) => {
        i18n.addResourceBundle(lng, "translation", m.default, true, false);
      },
      (err: unknown) => {
        loading.delete(lng); // let a later switch retry
        throw err;
      },
    );
    loading.set(lng, p);
  }
  return p;
}

/** Resolves once the initial UI language is loaded and active (falls back to
 * English if its chunk can't load — never rejects). */
export const i18nReady: Promise<void> =
  initial === "en"
    ? Promise.resolve()
    : loadUiLanguage(initial).then(
        () => void i18n.changeLanguage(initial),
        () => undefined,
      );

/** <html lang> follows the UI language (WCAG 3.1.1): the prerendered shell
 * says "en", and hydration doesn't patch it — screen readers would voice a
 * Danish UI in English. */
export function syncDocumentLang(
  lng: string | undefined,
  doc: { documentElement: { lang: string } } | undefined = typeof document !== "undefined"
    ? document
    : undefined,
) {
  if (lng && doc && doc.documentElement.lang !== lng) doc.documentElement.lang = lng;
}
syncDocumentLang(i18n.language);
i18n.on("languageChanged", (lng) => syncDocumentLang(lng));

/** Remembers the choice and switches once its strings are in; if the chunk
 * can't load (offline), the UI stays as it is. */
export function setUiLanguage(lng: UiLanguage) {
  localStorage.setItem("uiLanguage", lng);
  loadUiLanguage(lng).then(
    () => void i18n.changeLanguage(lng),
    () => undefined,
  );
}

export default i18n;
