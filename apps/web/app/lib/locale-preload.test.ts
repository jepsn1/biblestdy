import { describe, expect, it } from "vitest";
import { localePreloadScript, pickUiLanguage } from "./locale-preload";

describe("pickUiLanguage (#12, #209)", () => {
  it("a stored choice wins; otherwise the browser's language", () => {
    expect(pickUiLanguage("en", "da-DK")).toBe("en");
    expect(pickUiLanguage("da", "en-US")).toBe("da");
    expect(pickUiLanguage(null, "DA")).toBe("da");
    expect(pickUiLanguage("xx", "en-GB")).toBe("en");
    expect(pickUiLanguage(null, undefined)).toBe("en");
  });
});

describe("Danish chunk preload script (#209)", () => {
  const run = (stored: string | null, language: string) => {
    const head: { rel: string; href: string }[] = [];
    const env = {
      localStorage: { getItem: () => stored },
      navigator: { language },
      document: { createElement: () => ({ rel: "", href: "" }), head: { appendChild: (l: never) => head.push(l) } },
    };
    new Function("localStorage", "navigator", "document", localePreloadScript("/assets/da-X.js"))(
      env.localStorage,
      env.navigator,
      env.document,
    );
    return head;
  };

  it("preloads the chunk for a device that starts in Danish", () => {
    expect(run("da", "en-US")).toEqual([{ rel: "modulepreload", href: "/assets/da-X.js" }]);
    expect(run(null, "da-DK")).toHaveLength(1);
  });

  it("an English device fetches nothing extra", () => {
    expect(run("en", "da-DK")).toEqual([]);
    expect(run(null, "en-US")).toEqual([]);
  });

  it("never throws (storage blocked)", () => {
    expect(() =>
      new Function("localStorage", "navigator", "document", localePreloadScript("/x.js"))(
        { getItem: () => { throw new Error("blocked"); } },
        { language: "da" },
        {},
      ),
    ).not.toThrow();
  });
});
