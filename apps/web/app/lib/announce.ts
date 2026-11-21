/**
 * Polite screen-reader announcements with no visible chrome (#257): what a
 * routine toast used to say ("Copied John 3:16 (WEB)", "Highlighted",
 * "Now reading …") is read out, never shown. One sr-only live region in the
 * root layout (`#announcer`), made here if it's missing.
 *
 * An open modal (Radix dialog, sheet) hides the rest of <body> from screen
 * readers, and a live region inside aria-hidden is silent — so the words wait
 * until the region is exposed again (the dialog that ran the action closed),
 * up to a couple of seconds.
 */

export const ANNOUNCER_ID = "announcer";
const STEP_MS = 100;
const GIVE_UP_MS = 2500;

type Region = Pick<HTMLElement, "textContent" | "closest">;

let timer: ReturnType<typeof setTimeout> | undefined;

/** Read `message` out politely. Clears first, so the same words twice are
 * read again. No-op without a document (tests, SSR). */
export function announce(
  message: string,
  region: (() => Region | null) | undefined = typeof document !== "undefined" ? findRegion : undefined,
) {
  const el = region?.();
  if (!el) return;
  el.textContent = "";
  clearTimeout(timer);
  let waited = 0;
  const say = () => {
    // Hidden behind a modal: wait for it to close
    if (el.closest('[aria-hidden="true"], [inert]') && waited < GIVE_UP_MS) {
      waited += STEP_MS;
      timer = setTimeout(say, STEP_MS);
      return;
    }
    el.textContent = message;
  };
  // A beat after clearing: screen readers notice the change
  timer = setTimeout(say, STEP_MS);
}

function findRegion(): HTMLElement {
  const found = document.getElementById(ANNOUNCER_ID);
  if (found) return found;
  const el = document.createElement("div");
  el.id = ANNOUNCER_ID;
  el.className = "sr-only";
  el.setAttribute("aria-live", "polite");
  el.setAttribute("aria-atomic", "true");
  document.body.append(el);
  return el;
}
