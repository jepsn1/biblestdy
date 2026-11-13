import { useSyncExternalStore } from "react";
import { THEME_KEY } from "./theme-prepaint";

/**
 * Light / dark / system (#62). Device-local (localStorage), not an account
 * preference: a phone in dark mode and a desk screen in light are both right.
 * "system" follows prefers-color-scheme live. root.tsx applies it pre-paint.
 */
export const THEME_PREFS = ["light", "dark", "system"] as const;
export type ThemePref = (typeof THEME_PREFS)[number];

const DARK_QUERY = "(prefers-color-scheme: dark)";

export function parseThemePref(value: string | null | undefined): ThemePref {
  return (THEME_PREFS as readonly string[]).includes(value ?? "") ? (value as ThemePref) : "light";
}

export function resolveDark(pref: ThemePref, systemDark: boolean): boolean {
  return pref === "dark" || (pref === "system" && systemDark);
}

let listeners: (() => void)[] = [];
function subscribe(cb: () => void) {
  listeners.push(cb);
  return () => {
    listeners = listeners.filter((l) => l !== cb);
  };
}
const notify = () => listeners.forEach((l) => l());

function readPref(): ThemePref {
  try {
    return parseThemePref(localStorage.getItem(THEME_KEY));
  } catch {
    return "light";
  }
}

function systemDark() {
  return typeof matchMedia !== "undefined" && matchMedia(DARK_QUERY).matches;
}

function apply(pref: ThemePref) {
  document.documentElement.classList.toggle("dark", resolveDark(pref, systemDark()));
}

function isDark() {
  return typeof document !== "undefined" && document.documentElement.classList.contains("dark");
}

/** Reactive "is the page dark right now" (whatever the preference). */
export function useIsDark() {
  return useSyncExternalStore(subscribe, isDark, () => false);
}

/** Reactive stored preference (light | dark | system). */
export function useThemePref(): ThemePref {
  return useSyncExternalStore(subscribe, readPref, () => "light");
}

export function setThemePref(pref: ThemePref) {
  try {
    localStorage.setItem(THEME_KEY, pref);
  } catch {
    // storage blocked: still applies for this session
  }
  apply(pref);
  notify();
}

/** Follow OS light/dark changes while the preference is "system". Call once
 * at app start; returns the cleanup. */
export function watchSystemTheme(): () => void {
  if (typeof matchMedia === "undefined") return () => {};
  const mql = matchMedia(DARK_QUERY);
  const onChange = () => {
    if (readPref() !== "system") return;
    apply("system");
    notify();
  };
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}
