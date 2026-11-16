import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { UserRound } from "lucide-react";
import { Hint } from "~/components/hint";
import { Drawer, DrawerContent, DrawerTitle } from "~/components/lazy-drawer";
import { Popover, PopoverClose, PopoverContent, PopoverTitle, PopoverTrigger } from "~/components/ui/popover";
import { ScrollArea } from "~/components/ui/scroll-area";
import { useIsMobile } from "~/hooks/use-mobile";
import { authClient } from "~/lib/auth-client";
import { lazyModule, useLazyModule, whenIdle } from "~/lib/lazy-module";
import { cn } from "~/lib/utils";
import { OPEN_SHORTCUTS, openColorNames } from "./dialog-events";
import { PanelHeader, panelTitleClass } from "./panel-header";

/** The rows + confirms (settings-panel.tsx): their own chunk, fetched once
 * the reader is idle, or when the chip is pointed at, focused or opened. */
const panel = lazyModule(() => import("./settings-panel"));

/** Event name: phones open the settings from the More sheet (the chip
 * leaves the one-row nav below sm); `detail` = the element focus goes back
 * to when they close. */
export const OPEN_SETTINGS = "biblestdy:settings";
export function openSettings(returnTo?: HTMLElement | null) {
  window.dispatchEvent(new CustomEvent(OPEN_SETTINGS, { detail: returnTo ?? null }));
}

const chipClass =
  "flex size-7 shrink-0 select-none items-center justify-center rounded-full bg-primary/15 text-meta font-semibold text-primary transition-colors hover:bg-primary/25";

/** Account chip at the end of the reader nav (issue #17): opens the settings
 * surface. Popover on desktop, content-sized bottom drawer on phones; both
 * share the PanelHeader (#62). Delete account is an AlertDialog owned here,
 * outside the popover/drawer, so closing those never unmounts it. */
export function AccountChip() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const chipRef = useRef<HTMLButtonElement>(null);
  // Where focus lands when the settings (or a dialog they open) close: the
  // chip, or the More trigger when opened from the More sheet
  const returnTo = useRef<HTMLElement | null>(null);
  // (More is only CSS-hidden from sm: after a rotate/resize across it, the
  // chip is the visible way back)
  const backTo = () => {
    const el = returnTo.current;
    return el?.isConnected && el.checkVisibility?.() !== false ? el : chipRef.current;
  };
  const { data: session } = authClient.useSession();
  const email = session?.user.email ?? "";
  const initial = email ? email[0].toUpperCase() : <UserRound className="size-4" />;

  // One Esc closes the settings (popover or drawer), even on the ×: that
  // button's focus tooltip would otherwise take (and stop) the first press.
  // Window capture runs before any popup's own Esc handling. A popup open in
  // the settings (Share with a friend) closes first, on its own
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !(e.target instanceof Element && e.target.closest("[data-share-choices]"))) setOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  useEffect(() => {
    function show(e: Event) {
      returnTo.current = (e as CustomEvent<HTMLElement | null>).detail;
      setOpen(true);
    }
    window.addEventListener(OPEN_SETTINGS, show);
    return () => window.removeEventListener(OPEN_SETTINGS, show);
  }, []);

  /** Opened from the chip itself: focus comes back to it. */
  function openFromChip(next: boolean) {
    if (next) returnTo.current = null;
    setOpen(next);
  }

  function askDelete() {
    setOpen(false);
    setDeleteOpen(true);
  }

  /** Log out (moved here from the books sidebar): confirmed first — signing
   * in again means fetching a new email code. */
  function askSignOut() {
    setOpen(false);
    setSignOutOpen(true);
  }

  /** Colour names: the settings close first, the dialog takes over (focus
   * comes back to the chip). */
  function showColorNames() {
    setOpen(false);
    openColorNames(backTo());
  }

  /** The `?` list (#65) — the popover closes first, the dialog takes over. */
  function showShortcuts() {
    setOpen(false);
    window.dispatchEvent(new Event(OPEN_SHORTCUTS));
  }

  // Idle, or the chip reached for: the panel arrives before it opens
  const [wanted, setWanted] = useState(false);
  useEffect(() => whenIdle(() => setWanted(true)), []);
  const { value: ui, error, retry } = useLazyModule(panel, wanted || open);
  const want = () => setWanted(true);

  const content = ui ? (
    <ui.SettingsContent
      email={email}
      onSignOut={askSignOut}
      onDelete={askDelete}
      onColorNames={showColorNames}
      onShortcuts={isMobile ? undefined : showShortcuts}
      onReplayTour={() => setOpen(false)}
    />
  ) : (
    // Not here yet (a cold open): a quiet line, or a way to try again
    <p role="status" className="py-6 text-center text-meta text-muted-foreground">
      {error ? (
        <button type="button" className="underline underline-offset-2" onClick={retry}>
          {t("common.loadFailed")} {t("toast.retry")}
        </button>
      ) : (
        t("settings.loading")
      )}
    </p>
  );

  return (
    <>
      {isMobile ? (
        <>
          {/* Below sm (or a row under 36rem) the chip leaves the nav; More's
              Settings row opens this same drawer. Worded here too (#144:
              no lone initial between sm and md) */}
          <button
            ref={chipRef}
            type="button"
            aria-label={t("settings.open")}
            className="hidden shrink-0 items-center gap-2 rounded-full pr-2.5 hover:bg-muted sm:@min-[36rem]/nav:flex"
            onPointerEnter={want}
            onFocus={want}
            onClick={() => openFromChip(true)}
          >
            <span className={chipClass}>{initial}</span>
            <span className="text-control">{t("settings.short")}</span>
          </button>
          <Drawer open={open} onOpenChange={setOpen} showSwipeHandle>
            {/* Content-sized (#62): grows with the rows, capped at 92dvh */}
            <DrawerContent className="[--drawer-content-max-height:92dvh]" finalFocus={backTo}>
              <PanelHeader onClose={() => setOpen(false)} closeLabel={t("settings.close")}>
                <DrawerTitle className={panelTitleClass}>{t("settings.title")}</DrawerTitle>
              </PanelHeader>
              <ScrollArea className="min-h-0 flex-1">
                <div className="px-4 pt-2 pb-8">{content}</div>
              </ScrollArea>
            </DrawerContent>
          </Drawer>
        </>
      ) : (
        // A settings surface, not a menu: Tab stays inside until it closes
        // (Esc, the close button, or a press outside) — then focus is back
        // on the chip
        <Popover open={open} onOpenChange={openFromChip} modal="trap-focus">
          <Hint label={t("settings.open")}>
            <PopoverTrigger
              render={
                <button
                  ref={chipRef}
                  type="button"
                  aria-label={t("settings.open")}
                  onPointerEnter={want}
                  onFocus={want}
                  className={cn(
                    // hidden below sm here too: the first render (isMobile
                    // not known yet) mustn't show, or measure, the chip
                    // …and under a 36rem row, where More holds Settings (#144)
                    "hidden shrink-0 items-center gap-2 rounded-full pr-2.5 hover:bg-muted sm:@min-[36rem]/nav:flex",
                  )}
                />
              }
            >
              <span className={chipClass}>{initial}</span>
              {/* The word next to the chip, at every size (Birthe, persona
                  panel 2026-11-15: no lone icons) */}
              <span className="text-control">
                {t("settings.short")}
              </span>
            </PopoverTrigger>
          </Hint>
          <PopoverContent
            align="end"
            // Opened from More (the chip is out of the row): under More
            anchor={() => (chipRef.current?.checkVisibility?.() === false ? returnTo.current : chipRef.current)}
            finalFocus={backTo}
            className="w-80 max-w-[calc(100vw-1rem)] gap-0 p-0"
          >
            {/* The × is the popover's Close part: Base UI traps focus only with one */}
            <PanelHeader
              onClose={() => setOpen(false)}
              closeLabel={t("settings.close")}
              closeAs={(button) => <PopoverClose render={button} />}
            >
              <PopoverTitle className={panelTitleClass}>{t("settings.title")}</PopoverTitle>
            </PanelHeader>
            <div className="px-4 pt-2 pb-3">{content}</div>
          </PopoverContent>
        </Popover>
      )}
      {/* Opened from the panel's rows: loaded by then */}
      {ui && (
        <>
          <ui.DeleteAccountDialog open={deleteOpen} onOpenChange={setDeleteOpen} returnFocus={backTo} />
          <ui.SignOutDialog open={signOutOpen} onOpenChange={setSignOutOpen} returnFocus={backTo} />
        </>
      )}
    </>
  );
}
