import { describe, expect, it } from "vitest";
import { afterEach, vi } from "vitest";
import { currentPath, nextFromSearch, safeNext, setOpenNote, signinHref } from "./next-path";

describe("safeNext (sign-in return path)", () => {
  it.each(["/read/ROM/8", "/read/JHN/3?p=2", "/notes/abc-123", "/notes?topic=grace", "/"])(
    "keeps the app path %s",
    (path) => expect(safeNext(path)).toBe(path),
  );

  it.each([
    ["absolute URL", "https://evil.example/read"],
    ["protocol-relative", "//evil.example"],
    ["backslash trick", "/\\evil.example"],
    ["no leading slash", "read/ROM/8"],
    ["javascript:", "javascript:alert(1)"],
    ["tab smuggling //", "/\t/evil.example"],
    ["newline", "/read\n/x"],
    ["sign-in itself", "/signin?next=/read"],
    ["dot segment to //", "/.//evil.example"],
    ["parent segment to //", "/a/..//evil.example"],
    ["encoded dot to //", "/%2e//evil.example"],
    ["encoded parent to //", "/%2E%2E//evil.example"],
    ["dot segment to /\\", "/./\\evil.example"],
    ["bare dot to //", "/.//"],
    ["data:", "data:text/html,x"],
    ["empty", ""],
    ["missing", null],
  ])("rejects %s", (_, raw) => expect(safeNext(raw)).toBeNull());

  it("normalises dot segments without leaving the origin", () => {
    expect(safeNext("/read/../notes")).toBe("/notes");
  });

  it("keeps an encoded slash encoded (a path, not a host)", () => {
    expect(safeNext("/%2F%2Fevil.example")).toBe("/%2F%2Fevil.example");
  });
});

describe("signinHref / nextFromSearch", () => {
  it("round-trips a deep link", () => {
    const href = signinHref("/read/ROM/8?p=2");
    expect(href).toBe("/signin?next=%2Fread%2FROM%2F8%3Fp%3D2");
    expect(nextFromSearch(href.slice("/signin".length))).toBe("/read/ROM/8?p=2");
  });

  it("is plain /signin for the home page or junk", () => {
    expect(signinHref("/")).toBe("/signin");
    expect(signinHref("https://evil.example")).toBe("/signin");
  });

  it("falls back to / for an unsafe or absent next", () => {
    expect(nextFromSearch("?next=https%3A%2F%2Fevil.example")).toBe("/");
    expect(nextFromSearch("?next=%2F%2Fevil.example")).toBe("/");
    expect(nextFromSearch("")).toBe("/");
    expect(nextFromSearch("?next=%2F.%2F%2Fevil.example")).toBe("/");
    expect(nextFromSearch("?next=%2F%2E%2E%2F%2Fevil.example")).toBe("/");
    expect(nextFromSearch("?next=%2F%09%2Fevil.example")).toBe("/");
  });
});

describe("currentPath", () => {
  afterEach(() => {
    setOpenNote(null);
    vi.unstubAllGlobals();
  });
  const at = (pathname: string, search = "") =>
    vi.stubGlobal("window", { location: { pathname, search, hash: "" } });

  it("adds the note open beside the text, so sign-in reopens it", () => {
    at("/read/JHN/3", "?p=2");
    setOpenNote("n1");
    expect(currentPath()).toBe("/read/JHN/3?p=2&note=n1");
  });

  it("leaves a note the URL already names, and other pages, alone", () => {
    setOpenNote("n1");
    at("/read/JHN/3", "?note=n2");
    expect(currentPath()).toBe("/read/JHN/3?note=n2");
    at("/notes/n1");
    expect(currentPath()).toBe("/notes/n1");
  });
});
