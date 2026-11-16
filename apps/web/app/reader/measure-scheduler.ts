/**
 * One scheduler for every reader measurer (the sheet's page count, the
 * marker washes, the pen marks and margin boxes): ONE ResizeObserver, so a
 * window drag delivers every changed box in a single callback per frame, and
 * each measurer runs at most once in it. Pure reads go first — layout is
 * still clean in the observer's delivery — and measurers that have to touch
 * the DOM to read (`late`: the sheet hides the run-on spill) go last, so the
 * frame pays for one forced layout at most.
 *
 * Runs inside the delivery, not a later requestAnimationFrame: the delivery
 * is already once per frame, after layout and before paint — a rAF would
 * hold the ink at its old spot for one more painted frame.
 *
 * A notice with the size last seen for that box is skipped. A box's first
 * notice after observe() still runs: it may have moved since the mount's
 * own measure. Webfonts landing rewrap the words inside unchanged boxes:
 * every measurer runs once then — and so does in-flow ink appearing (a
 * phone's note markers push the words along inside the same boxes, #202).
 */

export type MeasureReason = "resize" | "fonts" | "reflow";

export type MeasureJob = {
  /** Read layout, then set state. Swappable: callers keep the job and
   * replace `run` with their latest closure — no re-observe. */
  run: (reason: MeasureReason) => void;
  /** Toggles the DOM to read (forces a layout): after every pure read. */
  late?: boolean;
};

type Observer = { observe(el: Element): void; unobserve(el: Element): void };

/** Width × height, content and border box: a padding change (text size)
 * counts even where the content box keeps its size. */
function sizeKey(e: ResizeObserverEntry): string {
  const b = e.borderBoxSize?.[0];
  return `${e.contentRect.width}x${e.contentRect.height}/${b?.inlineSize}x${b?.blockSize}`;
}

export function createMeasureScheduler(makeObserver: (cb: (entries: ResizeObserverEntry[]) => void) => Observer) {
  const watchers = new Map<Element, Set<MeasureJob>>();
  const sizes = new Map<Element, string>();
  let observer: Observer | null = null;

  function runJobs(jobs: Set<MeasureJob>, reason: MeasureReason) {
    for (const job of jobs) if (!job.late) job.run(reason);
    for (const job of jobs) if (job.late) job.run(reason);
  }

  function onResize(entries: ResizeObserverEntry[]) {
    const due = new Set<MeasureJob>();
    for (const e of entries) {
      const key = sizeKey(e);
      if (sizes.get(e.target) === key) continue;
      sizes.set(e.target, key);
      for (const job of watchers.get(e.target) ?? []) due.add(job);
    }
    runJobs(due, "resize");
  }

  return {
    /** Re-run `job` whenever one of `targets` changes size. Returns the
     * unwatch. Several jobs on one element share its observation. */
    watch(targets: Element[], job: MeasureJob): () => void {
      observer ??= makeObserver(onResize);
      for (const el of targets) {
        let jobs = watchers.get(el);
        if (!jobs) {
          watchers.set(el, (jobs = new Set()));
          observer.observe(el);
        }
        jobs.add(job);
      }
      return () => {
        for (const el of targets) {
          const jobs = watchers.get(el);
          if (!jobs) continue;
          jobs.delete(job);
          if (jobs.size > 0) continue;
          watchers.delete(el);
          sizes.delete(el);
          observer?.unobserve(el);
        }
      };
    },
    /** Every watching job, once (webfonts landed, in-flow ink changed). */
    runAll(reason: MeasureReason) {
      runJobs(new Set([...watchers.values()].flatMap((jobs) => [...jobs])), reason);
    },
  };
}
