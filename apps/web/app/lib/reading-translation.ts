import type { Translation } from "@biblestdy/shared";

/** A UI language's own Bible, pinned by id so another Bible in that language
 * landing on the API key can't silently become the default. */
const LANGUAGE_DEFAULTS: Record<string, string> = {
  da: "20c3695eb7339cca-01", // BPH, Bibelen på hverdagsdansk
};

export interface TranslationSignals {
  /** This device's choice (localStorage `translationId`). */
  stored: string | null;
  /** Where the account's marks live (GET /api/preferences/marked-translation). */
  marked: string | null;
  /** The UI language — null when it must not pick (not a first run). */
  uiLanguage: string | null;
}

/** The reading translation (#11), first match wins: this device's choice →
 * the Bible the account's marks are in (a new device still shows them) → a
 * Bible in the UI language (da → BPH), so a Danish first run never opens in
 * English → the API's first (its picker order). Ids no longer offered are
 * skipped. Device-local — syncing the choice per account is a follow-up. */
export function pickTranslation(
  translations: Translation[],
  { stored, marked, uiLanguage }: TranslationSignals,
): Translation {
  const byId = (id: string | null | undefined) => translations.find((t) => t.id === id);
  const lang = uiLanguage?.slice(0, 2).toLowerCase();
  return (
    byId(stored) ??
    byId(marked) ??
    (lang ? byId(LANGUAGE_DEFAULTS[lang]) ?? translations.find((t) => t.language === lang) : undefined) ??
    translations[0]
  );
}

/** The reading translation on this device. Asks where the account's marks
 * are (`fetchMarked`) only when nothing usable is stored. The UI language
 * only picks on the device's first run — someone already reading here on the
 * old default (no stored choice, but a lastRead) keeps that Bible. */
export async function readingTranslation(
  translations: Translation[],
  uiLanguage: string,
  fetchMarked: () => Promise<string | null>,
): Promise<Translation> {
  const [stored, lastRead] = storage(["translationId", "lastRead"]);
  const firstRun = lastRead === null;
  if (translations.some((t) => t.id === stored)) {
    return pickTranslation(translations, { stored, marked: null, uiLanguage: null });
  }
  const marked = await fetchMarked().catch(() => null);
  return pickTranslation(translations, { stored, marked, uiLanguage: firstRun ? uiLanguage : null });
}

function storage(keys: string[]): (string | null)[] {
  try {
    return keys.map((k) => localStorage.getItem(k));
  } catch {
    return keys.map(() => null); // blocked (or no window): a first run
  }
}

/** Keeps the picked default once its chapter has loaded, so a later
 * UI-language switch doesn't swap the Bible under the reader. Never replaces
 * an existing choice. */
export function rememberDefaultTranslation(id: string): void {
  try {
    if (localStorage.getItem("translationId") === null) localStorage.setItem("translationId", id);
  } catch {
    // storage blocked: the default is picked afresh each load
  }
}
