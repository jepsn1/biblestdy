import { useSyncExternalStore } from "react";

/**
 * Safe-area insets in px (#251), for the places CSS can't reach: popover
 * collision padding and drawer snap points take numbers, not env(). Read
 * from the app.css tokens (--safe-*), so the review shots' simulated insets
 * count here too. 0 on desktop and Android.
 */
export type Insets = { top: number; right: number; bottom: number; left: number };

export const NO_INSETS: Insets = Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 });

let probe: HTMLDivElement | null = null;
let last: Insets = NO_INSETS;

/** A hidden fixed box padded by the tokens: its computed padding is the inset. */
function readInsets(): Insets {
  if (typeof document === "undefined" || !document.body) return NO_INSETS;
  if (!probe?.isConnected) {
    probe = document.createElement("div");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText =
      "position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;" +
      "padding:var(--safe-top) var(--safe-right) var(--safe-bottom) var(--safe-left)";
    document.body.append(probe);
  }
  const cs = getComputedStyle(probe);
  const next = {
    top: parseFloat(cs.paddingTop) || 0,
    right: parseFloat(cs.paddingRight) || 0,
    bottom: parseFloat(cs.paddingBottom) || 0,
    left: parseFloat(cs.paddingLeft) || 0,
  };
  const same = next.top === last.top && next.right === last.right && next.bottom === last.bottom && next.left === last.left;
  if (!same) last = next;
  return last;
}

function subscribe(cb: () => void) {
  // Rotation changes which sides have insets
  window.addEventListener("resize", cb);
  window.addEventListener("orientationchange", cb);
  return () => {
    window.removeEventListener("resize", cb);
    window.removeEventListener("orientationchange", cb);
  };
}

/** Live insets (px); re-read on resize / rotation. */
export function useSafeInsets(): Insets {
  return useSyncExternalStore(subscribe, readInsets, () => NO_INSETS);
}

const padCache = new WeakMap<Insets, Insets>();

/** Floating UI collision padding: `base` px of air (Base UI's default 5),
 * plus the inset on each side. Same insets → same object (no re-position). */
export function collisionPadding(insets: Insets, base = 5): Insets {
  const hit = base === 5 ? padCache.get(insets) : undefined;
  if (hit) return hit;
  const pad = {
    top: base + insets.top,
    right: base + insets.right,
    bottom: base + insets.bottom,
    left: base + insets.left,
  };
  if (base === 5) padCache.set(insets, pad);
  return pad;
}

/** The on-screen keyboard is up: the visual viewport is well short of the
 * layout viewport (#251). It then covers the home indicator itself, so a
 * view following the visual viewport must not add the bottom inset too. */
export function keyboardUp(visualHeight: number, layoutHeight: number): boolean {
  return layoutHeight - visualHeight > 150;
}
