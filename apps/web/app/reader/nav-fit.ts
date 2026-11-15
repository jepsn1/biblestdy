import { useLayoutEffect, useState } from "react";

/** The book name keeps at least this many em before the row may wrap
 * ("1 Thess…", "Åbenbar…": still recognisable). */
export const NAME_MIN_EM = 5;

/** One control in the nav row, as laid out: its width now, and the width it
 * may shrink to (the search field gives way first), 0 when it can't. */
export type NavItem = { width: number; minWidth: number };

/**
 * Does the nav fit one row? Everything but the book name at its smallest,
 * plus the gaps, the padding and the name's minimum, against the row's
 * width. Measures the controls, not the name, so the answer is the same
 * whether the row is wrapped right now or not (no flip-flop).
 */
export function fitsOneRow({
  items,
  gap,
  padding,
  nameMin,
  available,
}: {
  items: NavItem[];
  gap: number;
  padding: number;
  nameMin: number;
  available: number;
}): boolean {
  const controls = items.reduce((sum, i) => sum + (i.minWidth > 0 ? Math.min(i.width, i.minWidth) : i.width), 0);
  // n controls + the name = n gaps between them
  const need = controls + gap * items.length + padding + nameMin;
  return need <= available + 0.5; // sub-pixel rounding
}

/** The row's in-flow, visible children except the name, measured. */
function measure(row: HTMLElement, name: HTMLElement): NavItem[] {
  const items: NavItem[] = [];
  for (const el of row.children) {
    if (el === name || !(el instanceof HTMLElement)) continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.position === "fixed" || cs.position === "absolute") continue;
    const shrinks = cs.flexShrink !== "0";
    items.push({ width: el.getBoundingClientRect().width, minWidth: shrinks ? parseFloat(cs.minWidth) || 0 : 0 });
  }
  return items;
}

/**
 * Reader nav: one row while the book name keeps NAME_MIN_EM; at large
 * text sizes or a narrow pane (sidebar open at 200%) the row may wrap rather
 * than push controls out of reach (WCAG 1.4.10). Re-checks when the row or
 * any control changes size (text size, language, translation, breakpoint).
 */
export function useNavWraps(
  row: React.RefObject<HTMLElement | null>,
  name: React.RefObject<HTMLElement | null>,
): boolean {
  const [wraps, setWraps] = useState(false);
  useLayoutEffect(() => {
    const r = row.current;
    const n = name.current;
    if (!r || !n) return;
    let frame = 0;
    const run = () => {
      const cs = getComputedStyle(r);
      const em = parseFloat(cs.fontSize) || 16;
      setWraps(
        !fitsOneRow({
          items: measure(r, n),
          gap: parseFloat(cs.columnGap) || 0,
          padding: (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0),
          nameMin: NAME_MIN_EM * em,
          available: r.clientWidth,
        }),
      );
    };
    // One measure per frame, however many controls resized
    const check = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(run);
    };
    run(); // before first paint: no one-frame flash of an overflowing row
    const observer = new ResizeObserver(check);
    const observeAll = () => {
      observer.disconnect();
      observer.observe(r);
      for (const el of r.children) observer.observe(el);
    };
    observeAll();
    // Controls come and go (install button, More vs chip): re-observe
    const children = new MutationObserver(() => {
      observeAll();
      check();
    });
    children.observe(r, { childList: true });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      children.disconnect();
    };
  }, [row, name]);
  return wraps;
}
