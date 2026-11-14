/**
 * One-time support notice: after 10 minutes of active reading on an account,
 * at a chapter change, a quiet card says biblestdy is free and points to
 * Instagram. Closing it snoozes it for 30 days on this device; active time
 * is counted on this device too (localStorage), no network.
 */

export const INSTAGRAM_HANDLE = "marcusjepsn";
export const INSTAGRAM_URL = `https://www.instagram.com/${INSTAGRAM_HANDLE}/`;
/** Instagram group chat invite (swap for the channel once there is one). */
export const GROUP_CHAT_URL = "https://ig.me/j/d4-wBd5KNzCY959L/";

export const SUPPORT_AFTER_SECONDS = 10 * 60;
const TICK_SECONDS = 15;
/** Visible tab but no input for this long = away, not reading. */
const IDLE_MS = 2 * 60 * 1000;

const key = (userId: string) => `activeSeconds:${userId}`;
const snoozeKey = (userId: string) => `supportSnoozeUntil:${userId}`;
export const SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;

/** Closed within the last 30 days (this device)? Unreadable storage = snoozed. */
export function supportSnoozed(userId: string, now = Date.now()): boolean {
  try {
    return now < (Number(localStorage.getItem(snoozeKey(userId))) || 0);
  } catch {
    return true;
  }
}

/** Close = come back in 30 days. */
export function snoozeSupport(userId: string, now = Date.now()): void {
  try {
    localStorage.setItem(snoozeKey(userId), String(now + SNOOZE_MS));
  } catch {
    // storage blocked: it just won't come back this session
  }
}

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
  snoozed: boolean;
  seconds: number;
  noteOpen: boolean;
  busy: boolean;
}): boolean {
  return !opts.snoozed && opts.seconds >= SUPPORT_AFTER_SECONDS && !opts.noteOpen && !opts.busy;
}
