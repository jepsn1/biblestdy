import { useCallback, useEffect, useState } from "react";

/**
 * A code-split module loaded on demand (M8): the note editor and the command
 * palette stay out of the reader's first load. One shared promise, so a
 * preload (idle, hover, focus) and the real use never fetch twice; a failed
 * load is forgotten, so the next try fetches again (flaky network, deploy).
 */
export type LazyModule<T> = {
  /** Starts the download now; errors are left for the real use to show. */
  preload: () => void;
  load: () => Promise<T>;
  /** The module if it already arrived — renders it without a loading frame. */
  peek: () => T | undefined;
};

export function lazyModule<T>(importer: () => Promise<T>): LazyModule<T> {
  let promise: Promise<T> | null = null;
  let value: T | undefined;
  const load = () =>
    (promise ??= importer().then(
      (m) => (value = m),
      (e: unknown) => {
        promise = null;
        throw e;
      },
    ));
  return {
    preload: () => void load().catch(() => {}),
    load,
    peek: () => value,
  };
}

/** Runs `fn` once the page has settled — a moment after the first paint,
 * then the browser's next idle time — so it never competes with the
 * chapter's own loading. Never when the reader asked to save data or the
 * connection is 2G-slow.
 * Returns a cancel. */
export function whenIdle(fn: () => void, afterMs = 1500): () => void {
  if (typeof window === "undefined") return () => {};
  const conn = (navigator as { connection?: { saveData?: boolean; effectiveType?: string } })
    .connection;
  if (conn?.saveData || /2g/.test(conn?.effectiveType ?? "")) return () => {};
  let idle: number | undefined;
  const timer = setTimeout(() => {
    // Safari: no requestIdleCallback — the delay alone
    if (typeof window.requestIdleCallback !== "function") fn();
    else idle = window.requestIdleCallback(fn, { timeout: 3000 });
  }, afterMs);
  return () => {
    clearTimeout(timer);
    if (idle !== undefined) window.cancelIdleCallback(idle);
  };
}

/** Downloads a lazy module when the browser is idle (see `whenIdle`). */
export function preloadWhenIdle(mod: LazyModule<unknown>): () => void {
  return whenIdle(mod.preload);
}

/**
 * The module once loaded (`undefined` meanwhile), the load error, and a
 * retry. `enabled: false` waits — nothing is fetched until it turns true.
 */
export function useLazyModule<T>(mod: LazyModule<T>, enabled = true) {
  const [value, setValue] = useState<T | undefined>(mod.peek);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled || value) return;
    // Preloaded already: state catches up via the same (resolved) promise
    let live = true;
    mod.load().then(
      (m) => live && setValue(() => m),
      (e: unknown) => {
        console.error("[lazy]", e);
        if (live) setError(e);
      },
    );
    return () => {
      live = false;
    };
  }, [mod, enabled, value, attempt]);
  const retry = useCallback(() => {
    setError(null);
    setAttempt((n) => n + 1);
  }, []);
  // Preloaded meanwhile (hover, idle): use it at once, no empty frame
  return { value: value ?? mod.peek(), error, retry };
}
