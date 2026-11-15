import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useLazyModule, whenIdle } from "~/lib/lazy-module";
import type { ReaderActions } from "./command-palette";
import { OPEN_PALETTE, palette, startTypeahead, takeTypeahead } from "./open-palette";

/**
 * The command palette, code-split (M8). Its chunk comes in once the reader is
 * idle (or on hover/focus of the nav's trigger), and the palette then mounts
 * closed, as before — so ⌘K is instant. Keys typed right after ⌘K are kept
 * (type-ahead, open-palette.ts) until its input has focus; opened before the
 * chunk is here, Esc cancels and a failed download says so.
 */
export function LazyCommandPalette({
  open,
  onOpenChange,
  reader,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reader: ReaderActions;
}) {
  const { t } = useTranslation();
  const [idle, setIdle] = useState(false);
  useEffect(() => whenIdle(() => setIdle(true)), []);
  const { value: mod, error, retry } = useLazyModule(palette, idle || open);

  // Synchronously with the open (before any render), so no key slips past
  useEffect(() => {
    window.addEventListener(OPEN_PALETTE, startTypeahead);
    return () => {
      window.removeEventListener(OPEN_PALETTE, startTypeahead);
      takeTypeahead();
    };
  }, []);
  useEffect(() => {
    if (!open) takeTypeahead();
  }, [open]);

  // Cold start: Esc while the chunk downloads cancels the open
  useEffect(() => {
    if (!open || mod) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onOpenChange(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, mod, onOpenChange]);

  useEffect(() => {
    if (!error || !open) return;
    toast.error(t("palette.loadFailed"));
    onOpenChange(false);
    retry(); // a later open tries the download again
  }, [error, open, onOpenChange, retry, t]);

  if (!mod) return null;
  return <mod.CommandPalette open={open} onOpenChange={onOpenChange} reader={reader} />;
}
