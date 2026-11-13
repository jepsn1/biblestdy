import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { modKey } from "~/components/hint";
import { Button } from "~/components/ui/button";
import { ignoreShortcut } from "~/lib/shortcuts";
import { openPalette as open } from "./command-palette";

/**
 * The nav's "Search or go to…" (replaces the jump box, #53). Same place and
 * width as the old field; a worded button, the shortcut only where a
 * keyboard is likely. Owns the keys: ⌘K / Ctrl+K from anywhere (bubble
 * phase, so the note editor's own ⌘K link dialog still wins inside notes),
 * `/` when not typing.
 */
export function PaletteTrigger() {
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
      <Button
        variant="ghost"
        size="icon-sm"
        className="ml-auto sm:hidden"
        aria-label={t("palette.open")}
        aria-haspopup="dialog"
        onClick={() => {
          proxy.current?.focus();
          open();
        }}
      >
        <Search />
      </Button>
      <input
        ref={proxy}
        aria-hidden
        tabIndex={-1}
        className="pointer-events-none fixed top-0 left-0 size-px text-phone opacity-0 sm:hidden"
      />
      <button
        type="button"
        aria-haspopup="dialog"
        aria-keyshortcuts="Meta+K Control+K /"
        onClick={open}
        className="ml-auto hidden h-7 w-52 items-center gap-2 rounded-md border border-input bg-transparent px-2 text-list text-muted-foreground hover:bg-muted sm:flex lg:w-72"
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
