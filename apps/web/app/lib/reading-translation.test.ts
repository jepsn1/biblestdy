import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Translation } from "@biblestdy/shared";
import { pickTranslation, readingTranslation, rememberDefaultTranslation } from "./reading-translation";

const NIV: Translation = { id: "niv", name: "New International Version", abbreviation: "NIV", language: "en" };
const WEB: Translation = { id: "web", name: "World English Bible", abbreviation: "WEB", language: "en" };
const DA2020: Translation = { id: "da2020", name: "Bibelen 2020", abbreviation: "DA20", language: "da" };
const BPH: Translation = { id: "20c3695eb7339cca-01", name: "Bibelen på hverdagsdansk", abbreviation: "BPH", language: "da" };
const ALL = [NIV, WEB, BPH];

const pick = (stored: string | null, marked: string | null, uiLanguage: string | null, list = ALL) =>
  pickTranslation(list, { stored, marked, uiLanguage });

describe("pickTranslation", () => {
  it("opens a Danish first run in BPH", () => {
    expect(pick(null, null, "da")).toBe(BPH);
    expect(pick(null, null, "da-DK")).toBe(BPH);
  });

  it("pins the Danish default by id, not by API order", () => {
    expect(pick(null, null, "da", [NIV, DA2020, BPH])).toBe(BPH);
    expect(pick(null, null, "da", [NIV, DA2020])).toBe(DA2020);
  });

  it("opens an English first run in the API's first (picker order)", () => {
    expect(pick(null, null, "en")).toBe(NIV);
  });

  it("a new device opens where the account's marks are, over the UI language", () => {
    expect(pick(null, "niv", "da")).toBe(NIV);
    expect(pick(null, "bph-gone", "da")).toBe(BPH);
  });

  it("never overrides a stored choice", () => {
    expect(pick("web", "niv", "da")).toBe(WEB);
    expect(pick("20c3695eb7339cca-01", "niv", "en")).toBe(BPH);
  });

  it("falls back when nothing matches", () => {
    expect(pick("retired", null, "da")).toBe(BPH);
    expect(pick(null, null, "da", [NIV, WEB])).toBe(NIV);
    expect(pick(null, null, "de")).toBe(NIV);
    expect(pick(null, null, null)).toBe(NIV);
  });
});

describe("readingTranslation + rememberDefaultTranslation", () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    });
  });
  const none = () => Promise.resolve(null);

  it("Danish first run, account without marks: BPH", async () => {
    expect(await readingTranslation(ALL, "da", none)).toBe(BPH);
  });

  it("Danish first run, account with NIV marks: NIV", async () => {
    expect(await readingTranslation(ALL, "da", () => Promise.resolve("niv"))).toBe(NIV);
  });

  it("a failed marks lookup still opens (UI-language default)", async () => {
    expect(await readingTranslation(ALL, "da", () => Promise.reject(new Error("502")))).toBe(BPH);
  });

  it("someone already reading here on the old default keeps it", async () => {
    store.set("lastRead", "JHN/3");
    expect(await readingTranslation(ALL, "da", none)).toBe(NIV);
  });

  it("a stored choice wins, without asking the server", async () => {
    store.set("translationId", "web");
    const fetchMarked = vi.fn(() => Promise.resolve("niv"));
    expect(await readingTranslation(ALL, "da", fetchMarked)).toBe(WEB);
    expect(fetchMarked).not.toHaveBeenCalled();
  });

  it("keeps the default, so a later UI-language switch keeps the Bible", async () => {
    rememberDefaultTranslation(BPH.id);
    expect(store.get("translationId")).toBe(BPH.id);
    expect(await readingTranslation(ALL, "en", none)).toBe(BPH);
  });

  it("never replaces an existing choice", () => {
    store.set("translationId", "web");
    rememberDefaultTranslation(BPH.id);
    expect(store.get("translationId")).toBe("web");
  });
});
