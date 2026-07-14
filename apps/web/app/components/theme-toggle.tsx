import { useTranslation } from "react-i18next";
import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

/** Paper (default) <-> charcoal. Class + localStorage; root.tsx applies the
 * stored theme before first paint. */

let listeners: (() => void)[] = [];

function subscribe(cb: () => void) {
  listeners.push(cb);
  return () => {
    listeners = listeners.filter((l) => l !== cb);
  };
}

function isDark() {
  return typeof document !== "undefined" && document.documentElement.classList.contains("dark");
}

/** Reactive current-theme flag (updates when the toggle flips). */
export function useIsDark() {
  return useSyncExternalStore(subscribe, isDark, () => false);
}

export function ThemeToggle() {
  const { t } = useTranslation();
  const dark = useSyncExternalStore(subscribe, isDark, () => false);

  function toggle() {
    document.documentElement.classList.toggle("dark");
    localStorage.setItem("theme", isDark() ? "dark" : "light");
    listeners.forEach((l) => l());
  }

  return (
    <button
      type="button"
      aria-label={dark ? t("theme.toPaper") : t("theme.toCharcoal")}
      onClick={toggle}
      className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}
