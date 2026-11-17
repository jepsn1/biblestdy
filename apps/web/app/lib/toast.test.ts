import { describe, expect, it, vi } from "vitest";

describe("lazy toast (#228)", () => {
  it("queues calls until Sonner is ready, replays in order, then calls straight through", async () => {
    const { toast, sonnerReady, onToastWaiting } = await import("./toast");
    const log: string[] = [];
    const waiting = vi.fn();
    const off = onToastWaiting(waiting);
    toast("a", { id: "x" });
    toast.error("b");
    toast.dismiss("x");
    expect(waiting).toHaveBeenCalledTimes(3);
    off();
    const t = Object.assign((m: unknown) => log.push(`toast:${String(m)}`), {
      error: (m: unknown) => log.push(`error:${String(m)}`),
      dismiss: (id?: unknown) => log.push(`dismiss:${String(id)}`),
    });
    sonnerReady({ toast: t as never });
    expect(log).toEqual(["toast:a", "error:b", "dismiss:x"]);
    toast("c");
    expect(log.at(-1)).toBe("toast:c");
    expect(waiting).toHaveBeenCalledTimes(3);
  });
});
