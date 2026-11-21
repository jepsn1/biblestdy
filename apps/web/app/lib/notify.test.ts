import { beforeEach, describe, expect, it, vi } from "vitest";
import { mountPlace, peekNotice, resetNotices, type Notice, type Place } from "./notices";

vi.spyOn(console, "error").mockImplementation(() => {});

const { UNDO_MS, notifyError, notifyInfo, notifyUndo, removeWithUndo } = await import("./notify");
const { ApiError } = await import("./query");

const at = (p: Place): Notice | null => peekNotice(p);
const flush = () => new Promise((r) => setTimeout(r, 0));

function setup(opts: { removeFails?: boolean; restoreFails?: boolean } = {}) {
  const log: string[] = [];
  const args = {
    hide: () => log.push("hide"),
    unhide: () => log.push("unhide"),
    remove: () => (opts.removeFails ? Promise.reject(new Error("500")) : Promise.resolve(log.push("remove"))),
    restore: () => (opts.restoreFails ? Promise.reject(new Error("404")) : Promise.resolve(log.push("restore"))),
    message: "Note deleted",
    retry: () => log.push("retry"),
  };
  return { log, args };
}

beforeEach(() => {
  resetNotices();
  mountPlace("page");
});

describe("removeWithUndo (#64, inline since #257)", () => {
  it("hides at once, deletes, then offers Undo that restores", async () => {
    const { log, args } = setup();
    expect(await removeWithUndo(args)).toBe(true);
    expect(log).toEqual(["hide", "remove"]);
    const n = at("page")!;
    expect(n).toMatchObject({ kind: "undo", message: "Note deleted" });
    expect(n.action?.label).toBe("Undo");
    await n.action!.run();
    expect(log).toEqual(["hide", "remove", "restore"]);
  });

  it("a failed delete un-hides and shows an error with Retry — no Undo", async () => {
    const { log, args } = setup({ removeFails: true });
    expect(await removeWithUndo(args)).toBe(false);
    expect(log).toEqual(["hide", "unhide"]);
    expect(at("page")).toMatchObject({ kind: "error", message: "Couldn’t delete" });
    at("page")!.action!.run();
    expect(log).toContain("retry");
  });

  it("a failed undo says so instead of failing silently", async () => {
    const { args } = setup({ restoreFails: true });
    await removeWithUndo(args);
    await at("page")!.action!.run();
    await flush();
    expect(at("page")).toMatchObject({ kind: "error" });
    expect(at("page")!.message).toMatch(/undo/i);
  });
});

describe("Undo stays long enough (WCAG 2.2.1)", () => {
  it("lasts at least 10 seconds", async () => {
    await removeWithUndo(setup().args);
    expect(UNDO_MS).toBeGreaterThanOrEqual(10_000);
    expect(at("page")!.ms).toBeGreaterThanOrEqual(UNDO_MS);
  });
});

describe("merging (panel D3)", () => {
  it("same-group removals merge, name the count, and Undo restores all", async () => {
    const log: string[] = [];
    const many = (items: Record<string, number>) => `${Object.values(items).reduce((a, b) => a + b, 0)} marks removed`;
    notifyUndo("Highlight removed", async () => void log.push("a"), { group: "mark", many });
    notifyUndo("Margin note removed", async () => void log.push("b"), { group: "mark", many });
    notifyUndo("Highlight removed", async () => void log.push("c"), { group: "mark", many });
    expect(at("page")).toMatchObject({ message: "3 marks removed", count: 3 });
    await at("page")!.action!.run();
    expect(log.sort()).toEqual(["a", "b", "c"]);
  });

  it("another kind replaces it", () => {
    notifyUndo("Highlight removed", async () => {}, { group: "mark" });
    notifyUndo("Note deleted", async () => {});
    expect(at("page")!.message).toBe("Note deleted");
  });

  it("info never covers a visible Undo", () => {
    notifyUndo("Highlight removed", async () => {});
    notifyInfo("Copied John 3:5 (WEB)");
    expect(at("page")!.message).toBe("Highlight removed");
  });
});

describe("routing (panel D7): never silent", () => {
  it("a place that isn't on screen falls back to the page", () => {
    notifyError(new Error("x"), { place: "settings", message: "Text size not saved" });
    expect(at("settings")).toBeNull();
    expect(at("page")!.message).toBe("Text size not saved");
  });

  it("with nothing mounted it waits, then shows once a place mounts", () => {
    resetNotices();
    notifyError(new Error("x"), { message: "Couldn’t save" });
    const off = mountPlace("page");
    expect(at("page")!.message).toBe("Couldn’t save");
    off();
  });

  it("the page hidden (phone note drawer): the note's row takes it", () => {
    resetNotices();
    mountPlace("note");
    notifyError(new Error("x"));
    expect(at("note")!.kind).toBe("error");
  });

  it("a place going away hands its notice on", () => {
    const off = mountPlace("settings");
    notifyError(new Error("x"), { place: "settings", message: "Not saved" });
    expect(at("settings")!.message).toBe("Not saved");
    off();
    expect(at("page")!.message).toBe("Not saved");
  });

  it("signed out (401): silent — sign-in is on its way", () => {
    notifyError(new ApiError(401, null, "no"));
    expect(at("page")).toBeNull();
  });
});
