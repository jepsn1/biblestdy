import { HIGHLIGHT_LABEL_MAX } from "@biblestdy/shared";
import { describe, expect, it } from "vitest";
import { cleanLabels } from "./highlight-labels";
import i18n, { loadUiLanguage } from "./i18n";

describe("colour names dialog copy", () => {
  it("the hint names the length limit, in both languages", async () => {
    await loadUiLanguage("da");
    expect(HIGHLIGHT_LABEL_MAX).toBe(30);
    expect(i18n.getFixedT("en")("colorNames.hint", { max: HIGHLIGHT_LABEL_MAX })).toMatch(/^Up to 30 characters\./);
    expect(i18n.getFixedT("da")("colorNames.hint", { max: HIGHLIGHT_LABEL_MAX })).toMatch(/^Højst 30 tegn\./);
  });
});

describe("cleanLabels", () => {
  it("tidies spaces and drops empty fields (back to the colour's own name)", () => {
    expect(cleanLabels({ blue: "  God   speaking ", rose: "   ", gold: "" })).toEqual({ blue: "God speaking" });
  });
});
