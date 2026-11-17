/**
 * Toasts without Sonner on first paint (#228): the same `toast` API the app
 * used from "sonner", but Sonner itself loads with the Toaster just after
 * first paint (components/lazy-toaster). Calls made before it's mounted wait
 * in order and replay once it is — nothing is lost, only the chunk moved.
 */
type Sonner = typeof import("sonner");
type Toast = Sonner["toast"];

let sonner: Pick<Sonner, "toast"> | undefined;
const queue: ((s: Pick<Sonner, "toast">) => void)[] = [];

let waiting: (() => void) | undefined;

function run(call: (s: Pick<Sonner, "toast">) => void) {
  if (sonner) return call(sonner);
  queue.push(call);
  waiting?.();
}

/** Called when a toast queues before Sonner is in — the Toaster retries a
 * failed download. Returns the unsubscribe. */
export function onToastWaiting(fn: () => void): () => void {
  waiting = fn;
  return () => {
    if (waiting === fn) waiting = undefined;
  };
}

/** The mounted Toaster hands over its Sonner; queued toasts replay in order. */
export function sonnerReady(s: Pick<Sonner, "toast">) {
  sonner = s;
  for (const call of queue.splice(0)) call(s);
}

export const toast = Object.assign(
  (...args: Parameters<Toast>) => run((s) => void s.toast(...args)),
  {
    error: (...args: Parameters<Toast["error"]>) => run((s) => void s.toast.error(...args)),
    dismiss: (...args: Parameters<Toast["dismiss"]>) => run((s) => void s.toast.dismiss(...args)),
  },
);
