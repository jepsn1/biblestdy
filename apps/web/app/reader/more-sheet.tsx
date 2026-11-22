import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Ellipsis, Layers, MonitorDown, NotebookTabs, NotebookText, Settings, Share, SquarePlus } from "lucide-react";
import { Link } from "react-router";
import { modKey } from "~/components/hint";
import { Button } from "~/components/ui/button";
import { Drawer, DrawerContent, DrawerTitle } from "~/components/lazy-drawer";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "~/components/ui/popover";
import { useIsMobile } from "~/hooks/use-mobile";
import { authClient } from "~/lib/auth-client";
import type { PwaInstall } from "~/hooks/use-pwa-install";
import { cn, focusRing } from "~/lib/utils";
import { openSettings } from "./account-settings";
import { PanelHeader, panelTitleClass } from "./panel-header";
import { ShareRows } from "./share-menu";

/** The nav row's width (rem, so text size counts) below which Notes and
 * Settings move into More on wider screens too (#144). Keep in step with
 * the `@min-[36rem]/nav` classes here, in reader-nav and account-settings. */
export const MORE_BELOW_REM = 36;

/**
 * "More" (#62, #144): where the row has no room for every control, the
 * rarer ones move into one worded button — full words plus a line of
 * explanation, one extra tap — never icons alone (Freja, Birthe). Phones
 * always (a sheet); wider screens once the nav row is under 36rem (large
 * text, a narrow window: a small panel under the button), as the last step
 * of the row's shed order (reader-nav). It holds Notes on this chapter,
 * margin notes (scroll mode), All notes, install, Share with a friend (#182)
 * and Settings, under who is signed in (the account circle leaves the row
 * with Settings).
 */
export function MoreSheet({
  connectionsOpen,
  onToggleConnections,
  annotationBoxesOpen,
  onToggleAnnotationBoxes,
  marginToggle,
  pwa,
}: {
  connectionsOpen: boolean;
  onToggleConnections: () => void;
  annotationBoxesOpen: boolean;
  onToggleAnnotationBoxes: () => void;
  /** The margin notes row: the text scrolls (phones, very large text). */
  marginToggle: boolean;
  pwa: PwaInstall;
}) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Settings row: open the settings only once this sheet has fully closed
  // (its focus return to More done), so the two surfaces never race for focus
  const settingsNext = useRef(false);
  const { data: session } = authClient.useSession();
  const email = session?.user.email;

  const rows = (
    <div className="flex flex-col gap-1 p-2 max-md:pb-8">
      {email && (
        <p className="truncate px-3 pt-1 pb-2 text-meta text-muted-foreground">
          {t("settings.signedInAs")} <span className="text-foreground">{email}</span>
        </p>
      )}
      <SheetRow
        icon={<NotebookText />}
        label={t("nav.connectionsToggle")}
        hint={t("nav.connectionsHint")}
        pressed={connectionsOpen}
        state={connectionsOpen ? t("nav.shown") : t("nav.hidden")}
        shortcut={isMobile ? undefined : "mod+."}
        onClick={() => {
          setOpen(false);
          onToggleConnections();
        }}
      />
      {marginToggle && (
        <SheetRow
          icon={<Layers />}
          label={t("nav.annotationsToggle")}
          hint={t("nav.annotationsHint")}
          pressed={annotationBoxesOpen}
          state={annotationBoxesOpen ? t("nav.shown") : t("nav.hidden")}
          onClick={onToggleAnnotationBoxes}
        />
      )}
      <SheetRow
        icon={<NotebookTabs />}
        label={t("nav.allNotes")}
        hint={t("nav.allNotesHint")}
        to="/notes"
        onClick={() => setOpen(false)}
      />
      {isMobile && pwa.kind === "prompt" && (
        <SheetRow
          icon={<MonitorDown />}
          label={t("nav.install")}
          hint={t("nav.installIosWhy")}
          onClick={() => {
            setOpen(false);
            void pwa.install();
          }}
        />
      )}
      {isMobile && pwa.kind === "ios-instructions" && (
        <div className="flex flex-col gap-2 rounded-lg px-3 py-3">
          <p className="flex items-center gap-3 text-control font-medium">
            <MonitorDown className="size-4 text-muted-foreground" />
            {t("nav.installIosTitle")}
          </p>
          <ol className="flex flex-col gap-1.5 pl-8 text-control text-muted-foreground">
            <li className="flex items-center gap-2">
              <Share className="size-4 shrink-0 text-primary" />
              {t("nav.installIosStep1")}
            </li>
            <li className="flex items-center gap-2">
              <SquarePlus className="size-4 shrink-0 text-primary" />
              {t("nav.installIosStep2")}
            </li>
          </ol>
        </div>
      )}
      {/* A row the reader chooses: the share sheet, or the choices under it */}
      <ShareRows rowClassName={ROW} onShared={() => setOpen(false)} />
      {/* The settings take over; closing them lands on More */}
      <SheetRow
        icon={<Settings />}
        label={t("settings.title")}
        hint={t("nav.settingsHint")}
        opensDialog
        onClick={() => {
          settingsNext.current = true;
          setOpen(false);
        }}
      />
    </div>
  );
  const afterClose = (isOpen: boolean) => {
    if (isOpen || !settingsNext.current) return;
    settingsNext.current = false;
    openSettings(triggerRef.current);
  };
  const triggerProps = {
    ref: triggerRef,
    variant: "ghost" as const,
    size: "sm" as const,
    // Phones always; wider screens while the row is narrow (container query)
    // Phones (#262 panel P3, 5–1): ⋯ alone, a 44px round chip like Search
    className: "shrink-0 sm:@min-[36rem]/nav:hidden max-md:size-[44px] max-md:rounded-full max-md:px-0 max-md:text-muted-foreground max-md:bg-(--chip) [--chip:color-mix(in_oklch,var(--foreground)_6%,transparent)] dark:[--chip:color-mix(in_oklch,var(--foreground)_10%,transparent)]",
    "aria-label": t("nav.more"),
    "aria-haspopup": "dialog" as const,
  };
  const label = (
    <>
      {/* Phones: dots read small, so 22px (Mads), growing with the text size to 30 */}
      <Ellipsis data-icon="inline-start" aria-hidden className="size-3.5 max-md:size-[clamp(22px,1.375rem,30px)]" />
      <span className="max-md:hidden">{t("nav.more")}</span>
    </>
  );

  if (!isMobile) {
    return (
      <Popover open={open} onOpenChange={setOpen} onOpenChangeComplete={afterClose}>
        <PopoverTrigger render={<Button {...triggerProps} />}>{label}</PopoverTrigger>
        <PopoverContent align="end" className="w-80 max-w-[calc(100vw-1rem)] gap-0 p-0">
          <PopoverTitle className="sr-only">{t("nav.moreTitle")}</PopoverTitle>
          {rows}
        </PopoverContent>
      </Popover>
    );
  }
  return (
    <>
      <Button {...triggerProps} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Drawer open={open} onOpenChange={setOpen} onOpenChangeComplete={afterClose} showSwipeHandle>
        <DrawerContent className="[--drawer-content-max-height:92dvh]">
          <PanelHeader onClose={() => setOpen(false)} closeLabel={t("nav.moreClose")}>
            <DrawerTitle className={panelTitleClass}>{t("nav.moreTitle")}</DrawerTitle>
          </PanelHeader>
          {rows}
        </DrawerContent>
      </Drawer>
    </>
  );
}

const ROW = cn(
  "flex min-h-12 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-muted [&_svg]:size-5 [&_svg]:shrink-0 [&_svg]:text-muted-foreground",
  focusRing,
);

function SheetRow({
  icon,
  label,
  hint,
  pressed,
  state,
  shortcut,
  opensDialog,
  to,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  pressed?: boolean;
  /** Visible on/off word for a toggle row. */
  state?: string;
  /** Its key, shown with the state ("mod+."; keyboards only). */
  shortcut?: string;
  /** The row opens another panel (aria-haspopup). */
  opensDialog?: boolean;
  /** A link row (a page). */
  to?: string;
  onClick: () => void;
}) {
  const className = cn(ROW, pressed && "bg-muted");
  const body = (
    <>
      {icon}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-control font-medium">{label}</span>
        <span className="text-meta text-muted-foreground">{hint}</span>
      </span>
      {(state || shortcut) && (
        <span className="flex shrink-0 flex-col items-end gap-0.5 text-meta text-muted-foreground">
          {state}
          {shortcut && <Kbd keys={shortcut} />}
        </span>
      )}
    </>
  );
  if (to) {
    return (
      <Link to={to} onClick={onClick} className={className}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" aria-pressed={pressed} aria-haspopup={opensDialog ? "dialog" : undefined} onClick={onClick} className={className}>
      {body}
    </button>
  );
}

/** "Ctrl+." / "⌘." as the tooltips write it. */
function Kbd({ keys }: { keys: string }) {
  const [mod, setMod] = useState("Ctrl+");
  useEffect(() => setMod(modKey()), []);
  return <kbd className="rounded border border-border bg-muted px-1 font-mono pointer-coarse:hidden">{keys.replace("mod+", mod)}</kbd>;
}
