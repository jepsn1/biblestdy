import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Hint, modKey } from "~/components/hint";
import { Button } from "~/components/ui/button";
import { opensPalette, useLiveShortcut } from "~/lib/shortcuts";
import { openPalette as open, palette, PALETTE_PROXY } from "./open-palette";

/**
 * The nav's "Search or go to…" (replaces the jump box, #53). A worded
 * field where the nav row (a container, `@container/nav`) has room, a
 * worded "Search" button where it hasn't — never an icon alone (Birthe,
 * persona panel 2026-11-15). Both show the keys: ⌘K / Ctrl+K first (on a
 * Danish keyboard "/" is Shift+7), then `/`. Owns the keys: ⌘K / Ctrl+K
 * from anywhere (bubble phase, so the note editor's own ⌘K link dialog still
 * wins inside notes), `/` when not typing. The field only takes what the
 * address leaves (basis 0, grows to its 18rem).
 */
export function PaletteTrigger() {
  const { t } = useTranslation();
  const live = useLiveShortcut();
  // Platform key resolved on the client (SSR markup never depends on it)
  const [mod, setMod] = useState("Ctrl+");
  // iOS opens the keyboard only for a focus inside the tap itself: focus this
  // proxy now, the palette's input takes over (keyboard stays up)
  const proxy = useRef<HTMLInputElement>(null);
  useEffect(() => setMod(modKey()), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!opensPalette(e)) return;
      e.preventDefault(); // beats the browser's own Ctrl+K (Firefox web search)
      open();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <Hint label={t("palette.open")} shortcut="mod+K">
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto shrink-0 gap-1.5 px-2 @min-[48rem]/nav:hidden"
          aria-label={t("palette.open")}
          aria-haspopup="dialog"
          aria-keyshortcuts={live("Meta+K Control+K /")}
          // The palette is its own chunk (M8): start it on the way in
          onPointerEnter={palette.preload}
          onPointerDown={palette.preload}
          onFocus={palette.preload}
          onClick={() => {
            proxy.current?.focus();
            open();
          }}
        >
          <Search aria-hidden />
          {t("nav.search")}
        </Button>
      </Hint>
      <input
        ref={proxy}
        {...{ [PALETTE_PROXY]: "" }}
        aria-hidden
        tabIndex={-1}
        className="pointer-events-none fixed top-0 left-0 size-px text-phone opacity-0 @min-[48rem]/nav:hidden"
      />
      <button
        type="button"
        aria-haspopup="dialog"
        aria-keyshortcuts={live("Meta+K Control+K /")}
        // The palette is its own chunk (M8): start it on the way in
        onPointerEnter={palette.preload}
        onFocus={palette.preload}
        onClick={open}
        className="ml-auto hidden h-7 max-w-72 min-w-40 grow basis-0 items-center gap-2 rounded-md border border-input bg-transparent px-2 text-list text-muted-foreground hover:bg-muted @min-[48rem]/nav:flex"
      >
        <Search className="size-3.5 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-left">{t("palette.open")}</span>
        <span className="flex shrink-0 gap-1 pointer-coarse:hidden" aria-hidden>
          <kbd className="rounded border border-border bg-muted px-1 font-mono text-meta">{mod}K</kbd>
          {live("/") && <kbd className="rounded border border-border bg-muted px-1 font-mono text-meta">/</kbd>}
        </span>
      </button>
    </>
  );
}
