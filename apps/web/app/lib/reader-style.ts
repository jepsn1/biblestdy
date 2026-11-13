import { isReaderStyle, type Preferences, type ReaderStyle } from "@biblestdy/shared";
import { useSyncExternalStore } from "react";
import { api } from "./query";

/**
 * Reader style (#45): Paper (default, no class) or Clean (`.style-clean` on
 * <html>). Saved per account (/api/preferences), mirrored to localStorage so
 * root.tsx applies it before first paint. Light/dark is separate (theme-toggle).
 */

/** Also hard-coded in root.tsx's pre-paint script — keep in sync. */
const STORAGE_KEY = "readerStyle";
export const STYLE_CLASS: Record<ReaderStyle, string> = {
  paper: "style-paper",
  clean: "style-clean",
};


let listeners: (() => void)[] = [];
function subscribe(cb: () => void) {
  listeners.push(cb);
  return () => {
    listeners = listeners.filter((l) => l !== cb);
  };
}

function current(): ReaderStyle {
  return typeof document !== "undefined" &&
    document.documentElement.classList.contains(STYLE_CLASS.clean)
    ? "clean"
    : "paper";
}

/** Reactive active style. */
export function useReaderStyle(): ReaderStyle {
  return useSyncExternalStore(subscribe, current, () => "paper");
}

/** Apply to <html> + mirror to localStorage (no server write). */
export function applyReaderStyle(style: ReaderStyle) {
  document.documentElement.classList.toggle(STYLE_CLASS.clean, style === "clean");
  try {
    localStorage.setItem(STORAGE_KEY, style);
  } catch {
    // storage blocked: class still applies for this session
  }
  listeners.forEach((l) => l());
}

/** Saved account choice, fetched once per user per page load. */
let cache: { userId: string; style: ReaderStyle | null } | undefined;

/**
 * Loads the account's style and applies it (call in protected route loaders).
 * Returns null when the user never chose → show the onboarding chooser. On a
 * network error returns the locally active style, so nobody gets nagged.
 */
export async function loadReaderStyle(userId: string): Promise<ReaderStyle | null> {
  if (cache?.userId === userId) return cache.style;
  let style: ReaderStyle | null;
  try {
    const prefs = await api<Preferences>("/api/preferences");
    style = isReaderStyle(prefs.readerStyle) ? prefs.readerStyle : null;
  } catch {
    return current();
  }
  cache = { userId, style };
  if (style) applyReaderStyle(style);
  return style;
}

/** User picked a style (chooser or settings): apply instantly, then persist. */
export async function saveReaderStyle(style: ReaderStyle) {
  applyReaderStyle(style);
  if (cache) cache = { ...cache, style };
  await api<Preferences>("/api/preferences", {
    method: "PATCH",
    body: JSON.stringify({ readerStyle: style }),
  });
}
