import { useLayoutEffect, useRef, useState, type DependencyList } from "react";
import { createMeasureScheduler, type MeasureJob, type MeasureReason } from "./measure-scheduler";

/** The app's one scheduler (see measure-scheduler.ts). */
const scheduler = createMeasureScheduler((cb) => new ResizeObserver(cb));
let fontsHooked = false;

/**
 * Measure before paint, and again whenever a target box resizes or webfonts
 * land — through the shared scheduler. `measure` always sees the latest
 * props: the observation lives as long as the target elements do, so
 * changing what is measured (deps) re-measures without re-observing (a page
 * turn costs no observer churn).
 */
export function useMeasure(
  targets: () => readonly (Element | null | undefined)[],
  measure: (reason: MeasureReason | "deps") => void,
  deps: DependencyList,
  { late = false }: { late?: boolean } = {},
) {
  const [job] = useState<MeasureJob>(() => ({ run: () => {}, late }));
  useLayoutEffect(() => {
    job.run = measure;
  });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the caller's deps
  useLayoutEffect(() => measure("deps"), deps);

  // (Re)watch only when the target elements themselves change
  const watched = useRef<{ els: Element[]; stop: () => void } | null>(null);
  useLayoutEffect(() => {
    const els = targets().filter((el): el is Element => !!el);
    const prev = watched.current;
    if (prev && prev.els.length === els.length && prev.els.every((el, i) => el === els[i])) return;
    prev?.stop();
    watched.current = els.length > 0 ? { els, stop: scheduler.watch(els, job) } : null;
    if (!fontsHooked && typeof document !== "undefined" && document.fonts) {
      fontsHooked = true;
      document.fonts.addEventListener("loadingdone", () => scheduler.runAll("fonts"));
    }
  });
  useLayoutEffect(
    () => () => {
      watched.current?.stop();
      watched.current = null;
    },
    [],
  );
}

/** Same plain data (rects, numbers): keep the old value — no re-render. */
export function sameData<T>(a: T, b: T): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

/** `value`, but the previous object while its data is the same — props
 * rebuilt on every render (a chapter's note marks) don't re-measure. */
export function useSameData<T>(value: T): T {
  const kept = useRef(value);
  if (!sameData(kept.current, value)) kept.current = value;
  return kept.current;
}
