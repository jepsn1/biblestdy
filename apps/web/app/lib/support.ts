/**
 * One-time support notice: after 10 minutes of active reading on an account,
 * at a chapter change, a quiet card says biblestdy is free and points to
 * Instagram. Shown once per account (dismissal saved in /api/preferences);
 * active time is counted on this device (localStorage), no network.
 */

export const INSTAGRAM_HANDLE = "marcusjepsn";
export const INSTAGRAM_URL = `https://www.instagram.com/${INSTAGRAM_HANDLE}/`;
/** Group chat: a DM to the owner until there's an invite link / channel. */
export const GROUP_CHAT_URL = `https://ig.me/m/${INSTAGRAM_HANDLE}`;

export const SUPPORT_AFTER_SECONDS = 10 * 60;
const TICK_SECONDS = 15;
/** Visible tab but no input for this long = away, not reading. */
const IDLE_MS = 2 * 60 * 1000;

const key = (userId: string) => `activeSeconds:${userId}`;

export function activeSeconds(userId: string): number {
  try {
    return Number(localStorage.getItem(key(userId))) || 0;
  } catch {
    return 0;
  }
}

/** Count active reading time while mounted; returns the cleanup. */
export function startActiveClock(userId: string): () => void {
  let lastInput = Date.now();
  const onInput = () => {
    lastInput = Date.now();
  };
  const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
  for (const e of events) window.addEventListener(e, onInput, { passive: true });
  const timer = window.setInterval(() => {
    if (document.visibilityState !== "visible" || Date.now() - lastInput > IDLE_MS) return;
    try {
      localStorage.setItem(key(userId), String(activeSeconds(userId) + TICK_SECONDS));
    } catch {
      // storage blocked: the notice just never shows
    }
  }, TICK_SECONDS * 1000);
  return () => {
    window.clearInterval(timer);
    for (const e of events) window.removeEventListener(e, onInput);
  };
}

/** Whether the reader is busy (a dialog, menu, toast or text selection) —
 * the notice never interrupts. */
export function readerBusy(doc: Document = document): boolean {
  if (doc.querySelector('[aria-modal="true"], [role="dialog"], [role="menu"], [data-sonner-toast]')) return true;
  const sel = doc.getSelection?.();
  return !!sel && !sel.isCollapsed;
}

export function shouldShowSupport(opts: {
  dismissed: boolean;
  seconds: number;
  noteOpen: boolean;
  busy: boolean;
}): boolean {
  return !opts.dismissed && opts.seconds >= SUPPORT_AFTER_SECONDS && !opts.noteOpen && !opts.busy;
}
