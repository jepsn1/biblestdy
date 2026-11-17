import { describe, expect, it, vi } from "vitest";
import { syncDocumentLang } from "./i18n";

describe("<html lang> follows the UI language (WCAG 3.1.1)", () => {
  it("sets the document's language", () => {
    const doc = { documentElement: { lang: "en" } };
    syncDocumentLang("da", doc);
    expect(doc.documentElement.lang).toBe("da");
  });

  it("ignores a language not resolved yet", () => {
    const doc = { documentElement: { lang: "en" } };
    syncDocumentLang(undefined, doc);
    expect(doc.documentElement.lang).toBe("en");
  });
});

describe("lazy locales (#209)", () => {
  it("English is there from the start; Danish only once loaded", async () => {
    const { default: i18n, loadUiLanguage } = await import("./i18n");
    expect(i18n.getFixedT("en")("colorNames.hint", { max: 30 })).toMatch(/^Up to 30/);
    expect(i18n.hasResourceBundle("da", "translation")).toBe(false);
    await loadUiLanguage("da");
    expect(i18n.getFixedT("da")("colorNames.hint", { max: 30 })).toMatch(/^Højst 30/);
  });

  it("keeps strings a lazy chunk added before the locale loaded", async () => {
    const { default: i18n, loadUiLanguage } = await import("./i18n");
    i18n.addResourceBundle("da", "translation", { zz209: { a: "før" } }, true, false);
    await loadUiLanguage("da");
    expect(i18n.getFixedT("da")("zz209.a")).toBe("før");
    expect(i18n.getFixedT("da")("colorNames.hint", { max: 30 })).toMatch(/^Højst 30/);
  });

  it("a switch flips the language only with its strings in", async () => {
    const { default: i18n, setUiLanguage } = await import("./i18n");
    const store = new Map<string, string>();
    globalThis.localStorage = { setItem: (k: string, v: string) => store.set(k, v) } as unknown as Storage;
    const seen: string[] = [];
    const onChange = (lng: string) => seen.push(`${lng}:${i18n.t("colorNames.hint", { max: 30 })}`);
    i18n.on("languageChanged", onChange);
    setUiLanguage("da");
    await vi.waitFor(() => expect(i18n.language).toBe("da"));
    i18n.off("languageChanged", onChange);
    expect(store.get("uiLanguage")).toBe("da");
    expect(seen).toEqual([expect.stringMatching(/^da:Højst 30/)]);
  });
});
