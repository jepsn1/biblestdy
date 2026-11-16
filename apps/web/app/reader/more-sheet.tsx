import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Ellipsis, Layers, MonitorDown, NotebookText, Settings, Share, SquarePlus } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Drawer, DrawerContent, DrawerTitle } from "~/components/lazy-drawer";
import type { PwaInstall } from "~/hooks/use-pwa-install";
import { cn, focusRing } from "~/lib/utils";
import { openSettings } from "./account-settings";
import { PanelHeader, panelTitleClass } from "./panel-header";

/**
 * Phone "More" (#62): the nav row has room for icons only, and icons alone
 * don't say what they do (Freja, Birthe). Rather than captions under every
 * icon (a taller nav on every page, cramped Danish words), the rarer actions
 * move into one labelled sheet: full words plus a line of explanation, one
 * extra tap. Desktop keeps them in the nav with tooltips + labels. The
 * settings live here too on phones, so the nav stays one row (Danish book
 * names pushed the chip onto a second line).
 */
export function MoreSheet({
  connectionsOpen,
  onToggleConnections,
  annotationBoxesOpen,
  onToggleAnnotationBoxes,
  pwa,
}: {
  connectionsOpen: boolean;
  onToggleConnections: () => void;
  annotationBoxesOpen: boolean;
  onToggleAnnotationBoxes: () => void;
  pwa: PwaInstall;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Settings row: open the settings only once this sheet has fully closed
  // (its focus return to More done), so the two drawers never race for focus
  const settingsNext = useRef(false);

  return (
    <>
      <Button
        ref={triggerRef}
        variant="ghost"
        size="sm"
        className="shrink-0 sm:hidden"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <Ellipsis data-icon="inline-start" />
        {t("nav.more")}
      </Button>
      <Drawer
        open={open}
        onOpenChange={setOpen}
        onOpenChangeComplete={(isOpen) => {
          if (isOpen || !settingsNext.current) return;
          settingsNext.current = false;
          openSettings(triggerRef.current);
        }}
        showSwipeHandle
      >
        <DrawerContent className="[--drawer-content-max-height:92dvh]">
          <PanelHeader onClose={() => setOpen(false)} closeLabel={t("nav.moreClose")}>
            <DrawerTitle className={panelTitleClass}>{t("nav.moreTitle")}</DrawerTitle>
          </PanelHeader>
          <div className="flex flex-col gap-1 p-2 pb-8">
            <SheetRow
              icon={<NotebookText />}
              label={t("nav.connectionsToggle")}
              hint={t("nav.connectionsHint")}
              pressed={connectionsOpen}
              onClick={() => {
                setOpen(false);
                onToggleConnections();
              }}
            />
            <SheetRow
              icon={<Layers />}
              label={t("nav.annotationsToggle")}
              hint={t("nav.annotationsHint")}
              pressed={annotationBoxesOpen}
              state={annotationBoxesOpen ? t("nav.shown") : t("nav.hidden")}
              onClick={onToggleAnnotationBoxes}
            />
            {pwa.kind === "prompt" && (
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
            {pwa.kind === "ios-instructions" && (
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
            {/* The settings drawer takes over; closing it lands on More */}
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
        </DrawerContent>
      </Drawer>
    </>
  );
}

function SheetRow({
  icon,
  label,
  hint,
  pressed,
  state,
  opensDialog,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  pressed?: boolean;
  /** Visible on/off word for a toggle row. */
  state?: string;
  /** The row opens another panel (aria-haspopup). */
  opensDialog?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-haspopup={opensDialog ? "dialog" : undefined}
      onClick={onClick}
      className={cn(
        "flex min-h-12 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-muted [&_svg]:size-5 [&_svg]:shrink-0 [&_svg]:text-muted-foreground",
        pressed && "bg-muted",
        focusRing,
      )}
    >
      {icon}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-control font-medium">{label}</span>
        <span className="text-meta text-muted-foreground">{hint}</span>
      </span>
      {state && <span className="shrink-0 text-meta text-muted-foreground">{state}</span>}
    </button>
  );
}
