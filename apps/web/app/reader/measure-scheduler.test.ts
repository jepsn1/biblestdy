import { describe, expect, it } from "vitest";
import { createMeasureScheduler, type MeasureJob } from "./measure-scheduler";

/** A stand-in ResizeObserver: counts observe/unobserve, delivers on demand. */
function fake() {
  const counts = { made: 0, observe: 0, unobserve: 0 };
  let deliver: (entries: ResizeObserverEntry[]) => void = () => {};
  const scheduler = createMeasureScheduler((cb) => {
    counts.made++;
    deliver = cb;
    return { observe: () => counts.observe++, unobserve: () => counts.unobserve++ };
  });
  const entry = (target: Element, w: number, h = 100) =>
    ({ target, contentRect: { width: w, height: h }, borderBoxSize: [{ inlineSize: w, blockSize: h }] }) as unknown as ResizeObserverEntry;
  return { scheduler, counts, entry, deliver: (...entries: ResizeObserverEntry[]) => deliver(entries) };
}

const el = (name: string) => ({ name }) as unknown as Element;

describe("measure scheduler", () => {
  it("shares one observer and runs each job once per delivery", () => {
    const { scheduler, counts, entry, deliver } = fake();
    const [box, flow] = [el("box"), el("flow")];
    const log: string[] = [];
    scheduler.watch([box, flow], { run: () => log.push("wash") });
    scheduler.watch([box], { run: () => log.push("pen") });
    expect(counts).toEqual({ made: 1, observe: 2, unobserve: 0 });
    deliver(entry(box, 600), entry(flow, 500));
    expect(log).toEqual(["wash", "pen"]);
  });

  it("runs DOM-toggling (late) jobs after every pure read", () => {
    const { scheduler, entry, deliver } = fake();
    const box = el("box");
    const log: string[] = [];
    scheduler.watch([box], { run: () => log.push("sheet"), late: true });
    scheduler.watch([box], { run: () => log.push("wash") });
    deliver(entry(box, 600));
    expect(log).toEqual(["wash", "sheet"]);
  });

  it("skips a box that reports the size it last had", () => {
    const { scheduler, entry, deliver } = fake();
    const box = el("box");
    let runs = 0;
    scheduler.watch([box], { run: () => runs++ });
    deliver(entry(box, 600));
    deliver(entry(box, 600));
    expect(runs).toBe(1);
    deliver(entry(box, 600.5));
    expect(runs).toBe(2);
  });

  it("swapping a job's run (a page turn) never re-observes", () => {
    const { scheduler, counts, entry, deliver } = fake();
    const box = el("box");
    let seen = -1;
    const job: MeasureJob = { run: () => {} };
    scheduler.watch([box], job);
    for (let page = 0; page < 5; page++) job.run = () => (seen = page);
    expect(counts).toEqual({ made: 1, observe: 1, unobserve: 0 });
    deliver(entry(box, 600));
    expect(seen).toBe(4);
  });

  it("keeps a shared box observed until its last watcher leaves", () => {
    const { scheduler, counts, entry, deliver } = fake();
    const box = el("box");
    let a = 0;
    const stopA = scheduler.watch([box], { run: () => a++ });
    const stopB = scheduler.watch([box], { run: () => {} });
    stopA();
    expect(counts.unobserve).toBe(0);
    deliver(entry(box, 600));
    expect(a).toBe(0);
    stopB();
    expect(counts.unobserve).toBe(1);
  });

  it("webfonts: every job once, with the reason", () => {
    const { scheduler } = fake();
    const [box, flow] = [el("box"), el("flow")];
    const log: string[] = [];
    scheduler.watch([box, flow], { run: (r) => log.push(`wash:${r}`) });
    scheduler.watch([box], { run: (r) => log.push(`sheet:${r}`), late: true });
    scheduler.runAll("fonts");
    expect(log).toEqual(["wash:fonts", "sheet:fonts"]);
  });
});
