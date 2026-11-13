import { DEFAULT_TEXT_SIZE, isTextSize, type TextSize } from "@biblestdy/shared";
import { useSyncExternalStore } from "react";
import { loadPreferences, savePreferences } from "./preferences";
import { TEXT_SIZE_KEY } from "./text-size-prepaint";

/**
 * In-app text size (#61). The viewport zoom lock stays (gestures + native
 * feel in Capacitor), so this is the WCAG 1.4.4 path: 100–200% set as the
 * root font-size, which scales reading text AND chrome (all rem-based).
 * Saved per account (/api/preferences), mirrored to localStorage so root.tsx
 * applies it before first paint (text-size-prepaint.ts).
 */

const STORAGE_KEY = TEXT_SIZE_KEY;

/** Stored value → a supported size (anything else = the default). */
export function parseTextSize(stored: string | null | undefined): TextSize {
  const n = Number(stored);
  return isTextSize(n) ? n : DEFAULT_TEXT_SIZE;
}

let listeners: (() => void)[] = [];
function subscribe(cb: () => void) {
  listeners.push(cb);
  return () => {
    listeners = listeners.filter((l) => l !== cb);
  };
}

function current(): TextSize {
  if (typeof document === "undefined") return DEFAULT_TEXT_SIZE;
  return parseTextSize(document.documentElement.style.fontSize.replace("%", ""));
}

/** Reactive active size (re-measure layouts that work in rem on change). */
export function useTextSize(): TextSize {
  return useSyncExternalStore(subscribe, current, () => DEFAULT_TEXT_SIZE);
}

/** Apply to <html> + mirror to localStorage (no server write). */
export function applyTextSize(size: TextSize) {
  document.documentElement.style.fontSize = size === DEFAULT_TEXT_SIZE ? "" : `${size}%`;
  try {
    localStorage.setItem(STORAGE_KEY, String(size));
  } catch {
    // storage blocked: the size still applies for this session
  }
  listeners.forEach((l) => l());
}

/** Applies the account's saved size (call in protected route loaders). */
export async function loadTextSize(userId: string): Promise<void> {
  const prefs = await loadPreferences(userId);
  if (prefs && isTextSize(prefs.textSize)) applyTextSize(prefs.textSize);
}

/** User picked a size in settings: apply instantly, then persist. */
export async function saveTextSize(size: TextSize) {
  applyTextSize(size);
  await savePreferences({ textSize: size });
}
