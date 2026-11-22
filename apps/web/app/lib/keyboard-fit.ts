import { useEffect } from "react";
import { keyboardUp } from "./safe-area";

/**
 * A full-height phone sheet with the on-screen keyboard up (#261): iOS
 * keeps the layout viewport, lays the keyboard over the sheet's lower part
 * and pans the page so the caret shows — the sheet's header (Close) can go
 * above the screen, its bottom row under the keyboard. The sheet's content
 * is fitted to the part on screen instead: padded down from the top by
 * what's above the visible area, up from the bottom by what's under the
 * keyboard. The popup itself (its height drives the snap points) is left
 * alone. Null: no keyboard, nothing to fit.
 */
export function keyboardInsets(
  vv: { offsetTop: number; height: number },
  layoutHeight: number,
  popupTop: number,
): { top: number; bottom: number } | null {
  if (!keyboardUp(vv.height, layoutHeight)) return null;
  return {
    top: Math.max(0, Math.round(vv.offsetTop - popupTop)),
    bottom: Math.max(0, Math.round(layoutHeight - vv.offsetTop - vv.height)),
  };
}

/** Keeps `popup` (a drawer-popup) fitted while `active`: `data-kb` plus
 * `--kb-top` / `--kb-bottom` (app.css pads its content by them; `data-kb-hide`
 * parts step aside). One rAF per viewport change. */
export function useKeyboardFit(popup: HTMLElement | null, active: boolean) {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!popup || !active || !vv) return;
    let frame = 0;
    const clear = () => {
      delete popup.dataset.kb;
      popup.style.removeProperty("--kb-top");
      popup.style.removeProperty("--kb-bottom");
    };
    const write = () => {
      frame = 0;
      const fit = keyboardInsets(vv, document.documentElement.clientHeight, popup.getBoundingClientRect().top);
      if (!fit) return clear();
      popup.dataset.kb = "";
      popup.style.setProperty("--kb-top", `${fit.top}px`);
      popup.style.setProperty("--kb-bottom", `${fit.bottom}px`);
    };
    const update = () => {
      if (!frame) frame = requestAnimationFrame(write);
    };
    write();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      cancelAnimationFrame(frame);
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      clear();
    };
  }, [popup, active]);
}
