import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import da from "../locales/da";
import en from "../locales/en";

/** UI locale (issue #12) — independent of the Scripture translation. Sticky
 * per device; first visit follows the browser. Adding a locale = a new file
 * in app/locales + one line here. */
export type UiLanguage = "en" | "da";

const stored =
  typeof localStorage !== "undefined" ? localStorage.getItem("uiLanguage") : null;
const browserDefault =
  typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("da")
    ? "da"
    : "en";

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, da: { translation: da } },
  lng: stored === "da" || stored === "en" ? stored : browserDefault,
  fallbackLng: "en",
  interpolation: { escapeValue: false }, // React escapes already
});

export function setUiLanguage(lng: UiLanguage) {
  localStorage.setItem("uiLanguage", lng);
  void i18n.changeLanguage(lng);
}

export default i18n;
