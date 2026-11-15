import { describe, expect, it } from "vitest";
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
