import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Hint, modKey } from "~/components/hint";
import { Button } from "~/components/ui/button";
import { ignoreShortcut } from "~/lib/shortcuts";
import { cn } from "~/lib/utils";
import { openPalette as open } from "./command-palette";

/**
 * The nav's "Search or go to…" (replaces the jump box, #53). Same place and
 * width as the old field; a worded button, the shortcut only where a
 * keyboard is likely. Owns the keys: ⌘K / Ctrl+K from anywhere (bubble
 * phase, so the note editor's own ⌘K link dialog still wins inside notes),
 * `/` when not typing. A search icon below lg, or at any width when
 * `iconOnly` (large text sizes), so the nav keeps to one row. The field
 * only takes what the book name leaves (basis 0, grows to its 18rem).
 */
export function PaletteTrigger({ iconOnly = false }: { iconOnly?: boolean }) {
  const { t } = useTranslation();
  // Platform key resolved on the client (SSR markup never depends on it)
  const [mod, setMod] = useState("Ctrl+");
  // iOS opens the keyboard only for a focus inside the tap itself: focus this
  // proxy now, the palette's input takes over (keyboard stays up)
  const proxy = useRef<HTMLInputElement>(null);
  useEffect(() => setMod(modKey()), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || e.isComposing) return;
      // Never stack on another modal (shortcuts list, chooser, onboarding)
      if (document.querySelector("[aria-modal='true'], [role='dialog'][data-open], [role='alertdialog'][data-open]")) return;
      // Alt+/ works from any field, the note editor too (code: Option+/ types ÷ on a Mac)
      if (e.altKey && !e.metaKey && !e.ctrlKey && e.code === "Slash") {
        e.preventDefault();
        open();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault(); // beats the browser's own Ctrl+K (Firefox web search)
        open();
        return;
      }
      if (e.key === "/" && !ignoreShortcut(e)) {
        e.preventDefault();
        open();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <Hint label={t("palette.open")} shortcut="mod+K">
        <Button
          variant="ghost"
          size="icon-sm"
          className={cn("ml-auto", !iconOnly && "lg:hidden")}
          aria-label={t("palette.open")}
          aria-haspopup="dialog"
          aria-keyshortcuts="Meta+K Control+K /"
          onClick={() => {
            proxy.current?.focus();
            open();
          }}
        >
          <Search />
        </Button>
      </Hint>
      <input
        ref={proxy}
        aria-hidden
        tabIndex={-1}
        className={cn("pointer-events-none fixed top-0 left-0 size-px text-phone opacity-0", !iconOnly && "lg:hidden")}
      />
      <button
        type="button"
        aria-haspopup="dialog"
        aria-keyshortcuts="Meta+K Control+K /"
        onClick={open}
        className={cn(
          "ml-auto hidden h-7 max-w-72 min-w-40 grow basis-0 items-center gap-2 rounded-md border border-input bg-transparent px-2 text-list text-muted-foreground hover:bg-muted",
          !iconOnly && "lg:flex",
        )}
      >
        <Search className="size-3.5 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-left">{t("palette.open")}</span>
        <kbd className="rounded border border-border bg-muted px-1 font-mono text-meta pointer-coarse:hidden">
          {mod}K
        </kbd>
      </button>
    </>
  );
}
