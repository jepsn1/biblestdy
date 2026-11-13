import { beforeEach, describe, expect, it, vi } from "vitest";

type Action = { label: string; onClick: () => void };
const calls: { kind: "toast" | "error"; message: string; action?: Action }[] = [];
vi.mock("sonner", () => {
  const toast = (message: string, opts?: { action?: Action }) =>
    calls.push({ kind: "toast", message, action: opts?.action });
  toast.error = (message: string, opts?: { action?: Action }) =>
    calls.push({ kind: "error", message, action: opts?.action });
  return { toast };
});
vi.spyOn(console, "error").mockImplementation(() => {});

const { removeWithUndo } = await import("./notify");

const flush = () => new Promise((r) => setTimeout(r, 0));

function setup(opts: { removeFails?: boolean; restoreFails?: boolean } = {}) {
  const log: string[] = [];
  const args = {
    hide: () => log.push("hide"),
    unhide: () => log.push("unhide"),
    remove: () =>
      opts.removeFails ? Promise.reject(new Error("500")) : Promise.resolve(log.push("remove")),
    restore: () =>
      opts.restoreFails ? Promise.reject(new Error("404")) : Promise.resolve(log.push("restore")),
    message: "Note deleted",
    retry: () => log.push("retry"),
  };
  return { log, args };
}

describe("removeWithUndo (#64)", () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it("hides at once, deletes, then offers Undo that restores", async () => {
    const { log, args } = setup();
    expect(await removeWithUndo(args)).toBe(true);
    expect(log).toEqual(["hide", "remove"]);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ kind: "toast", message: "Note deleted" });
    expect(calls[0].action?.label).toBe("Undo");

    calls[0].action!.onClick();
    await flush();
    expect(log).toEqual(["hide", "remove", "restore"]);
  });

  it("a failed delete un-hides and shows an error with Retry — no Undo", async () => {
    const { log, args } = setup({ removeFails: true });
    expect(await removeWithUndo(args)).toBe(false);
    expect(log).toEqual(["hide", "unhide"]);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ kind: "error", message: "Couldn’t delete" });
    calls[0].action!.onClick();
    expect(log).toContain("retry");
  });

  it("a failed undo says so instead of failing silently", async () => {
    const { args } = setup({ restoreFails: true });
    await removeWithUndo(args);
    calls[0].action!.onClick();
    await flush();
    expect(calls[1]).toMatchObject({ kind: "error" });
    expect(calls[1].message).toMatch(/undo/i);
  });
});
