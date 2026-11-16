import { describe, expect, it } from "vitest";
import en from "~/locales/en";
import da from "~/locales/da";
import { chapterOfPath, shareLinks, shareTarget } from "./share";
import { signinHref } from "./next-path";

/** A tiny t() over a locale's `share` block. */
function tOf(locale: { share: Record<string, string> }) {
  return (key: string, options?: Record<string, unknown>) =>
    locale.share[key.replace("share.", "")]!.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(options?.[k]));
}

const ORIGIN = "https://biblestdy.com";

describe("share target", () => {
  it("on a chapter: its reference and a link to it, nothing else", () => {
    const s = shareTarget("/read/JHN/3", ORIGIN, "en", tOf(en));
    expect(s).toEqual({
      place: "John 3",
      title: "John 3 on biblestdy",
      text: "Read John 3 with me on biblestdy.",
      url: "https://biblestdy.com/read/JHN/3",
    });
  });

  it("Danish: the Danish book name and line", () => {
    const s = shareTarget("/read/JHN/3", ORIGIN, "da", tOf(da));
    expect(s.title).toBe("Johannes 3 på biblestdy");
    expect(s.text).toBe("Læs Johannes 3 med mig på biblestdy.");
  });

  it("the chapter only: no page, verse or note in the link", () => {
    // Query strings never reach chapterOfPath (pathname only)
    expect(shareTarget("/read/PSA/23", ORIGIN, "en", tOf(en)).url).toBe("https://biblestdy.com/read/PSA/23");
  });

  it.each(["/", "/notes", "/notes/abc", "/read/XYZ/1", "/read/JHN/99", "/read/JHN/0", "/signin"])(
    "off a real chapter (%s): the front page",
    (path) => {
      const s = shareTarget(path, ORIGIN, "en", tOf(en));
      expect(s).toEqual({ place: null, title: "biblestdy", text: "Read the Bible with me on biblestdy.", url: "https://biblestdy.com/" });
    },
  );

  it("a signed-out friend is sent through sign-in back to the chapter", () => {
    const { pathname } = new URL(shareTarget("/read/ROM/8", ORIGIN, "en", tOf(en)).url);
    expect(signinHref(pathname)).toBe("/signin?next=%2Fread%2FROM%2F8");
  });

  it("chapterOfPath", () => {
    expect(chapterOfPath("/read/GEN/50")).toEqual({ book: "GEN", chapter: 50 });
    expect(chapterOfPath("/read/GEN/51")).toBeNull();
  });
});

describe("share links", () => {
  const target = shareTarget("/read/JHN/3", ORIGIN, "en", tOf(en));
  const links = shareLinks(target);

  it("Facebook gets the link", () => {
    const url = new URL(links.facebook);
    expect(url.origin + url.pathname).toBe("https://www.facebook.com/sharer/sharer.php");
    expect(url.searchParams.get("u")).toBe(target.url);
  });

  it("WhatsApp gets the line and the link", () => {
    expect(new URL(links.whatsapp).searchParams.get("text")).toBe("Read John 3 with me on biblestdy. https://biblestdy.com/read/JHN/3");
  });

  it("Email: subject + body, encoded", () => {
    expect(links.email).toBe(
      "mailto:?subject=John%203%20on%20biblestdy&body=Read%20John%203%20with%20me%20on%20biblestdy.%0A%0Ahttps%3A%2F%2Fbiblestdy.com%2Fread%2FJHN%2F3",
    );
  });
});
