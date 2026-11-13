import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";
import { READER_STYLES, TEXT_SIZES } from "@biblestdy/shared";
import { Monitor, Moon, Sun, UserRound } from "lucide-react";
import { Hint } from "~/components/hint";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { Button } from "~/components/ui/button";
import { Drawer, DrawerContent, DrawerTitle } from "~/components/ui/drawer";
import { Input } from "~/components/ui/input";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "~/components/ui/popover";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Separator } from "~/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { useIsMobile } from "~/hooks/use-mobile";
import { appChannel, appVersion } from "~/lib/app-info";
import { authClient } from "~/lib/auth-client";
import { setUiLanguage } from "~/lib/i18n";
import { saveReaderStyle, useReaderStyle } from "~/lib/reader-style";
import { saveTextSize, useTextSize } from "~/lib/text-size";
import { setThemePref, THEME_PREFS, useThemePref } from "~/lib/theme";
import { notifyError } from "~/lib/notify";
import { api } from "~/lib/query";
import { PanelHeader, panelTitleClass } from "./panel-header";
import { OPEN_SHORTCUTS } from "./shortcuts-dialog";
import { SupportLinks } from "./support-notice";

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
  const chipRef = useRef<HTMLButtonElement>(null);
  const { data: session } = authClient.useSession();
  const email = session?.user.email ?? "";
  const initial = email ? email[0].toUpperCase() : <UserRound className="size-4" />;

  function askDelete() {
    setOpen(false);
    setDeleteOpen(true);
  }

  /** The `?` list (#65) — the popover closes first, the dialog takes over. */
  function showShortcuts() {
    setOpen(false);
    window.dispatchEvent(new Event(OPEN_SHORTCUTS));
  }

  const content = (
    <SettingsContent email={email} onDelete={askDelete} onShortcuts={isMobile ? undefined : showShortcuts} />
  );

  return (
    <>
      {isMobile ? (
        <>
          <button
            ref={chipRef}
            type="button"
            aria-label={t("settings.open")}
            className={chipClass}
            onClick={() => setOpen(true)}
          >
            {initial}
          </button>
          <Drawer open={open} onOpenChange={setOpen} showSwipeHandle>
            {/* Content-sized (#62): grows with the rows, capped at 92dvh */}
            <DrawerContent className="[--drawer-content-max-height:92dvh]">
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
        <Popover open={open} onOpenChange={setOpen}>
          <Hint label={t("settings.open")}>
            <PopoverTrigger
              render={
                <button
                  ref={chipRef}
                  type="button"
                  aria-label={t("settings.open")}
                  className="flex items-center gap-2 rounded-full hover:bg-muted min-[1180px]:pr-2.5"
                />
              }
            >
              <span className={chipClass}>{initial}</span>
              {/* Visible word next to the chip on wide screens (#62) */}
              <span className="hidden text-control min-[1180px]:inline">{t("settings.short")}</span>
            </PopoverTrigger>
          </Hint>
          <PopoverContent align="end" className="w-80 max-w-[calc(100vw-1rem)] gap-0 p-0">
            <PanelHeader onClose={() => setOpen(false)} closeLabel={t("settings.close")}>
              <PopoverTitle className={panelTitleClass}>{t("settings.title")}</PopoverTitle>
            </PanelHeader>
            <div className="px-4 pt-2 pb-3">{content}</div>
          </PopoverContent>
        </Popover>
      )}
      <DeleteAccountDialog open={deleteOpen} onOpenChange={setDeleteOpen} returnFocus={chipRef} />
    </>
  );
}

/** One settings row (#62): label left, control right; 40px tall (48px on a
 * phone). Wraps the control under its label when it doesn't fit (200%). */
function SettingRow({
  label,
  labelId,
  children,
}: {
  label: string;
  labelId: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-10 flex-wrap items-center justify-between gap-x-4 gap-y-1.5 py-1 max-sm:min-h-12">
      <span id={labelId} className="text-control">
        {label}
      </span>
      {children}
    </div>
  );
}

/** Single-choice segmented control on shadcn ToggleGroup: arrow keys move,
 * Space/Enter picks; pressing the active item never clears the choice. */
function Segmented<T extends string>({
  value,
  options,
  onChange,
  labelledBy,
}: {
  value: T;
  options: { value: T; label: string; icon?: React.ReactNode }[];
  onChange: (value: T) => void;
  labelledBy: string;
}) {
  return (
    <ToggleGroup
      value={[value]}
      onValueChange={(next) => {
        const picked = next[0] as T | undefined;
        if (picked && picked !== value) onChange(picked);
      }}
      aria-labelledby={labelledBy}
      spacing={1}
      // Wraps instead of overflowing at 200% on a phone
      className="max-w-full flex-wrap rounded-lg bg-muted p-0.5"
    >
      {options.map((o) => (
        <ToggleGroupItem
          key={o.value}
          value={o.value}
          size="sm"
          className="h-7 gap-1.5 rounded-md px-2.5 text-meta font-normal text-muted-foreground hover:bg-background/60 hover:text-foreground aria-pressed:bg-background aria-pressed:font-medium aria-pressed:text-foreground aria-pressed:shadow-sm max-sm:h-9"
        >
          {o.icon}
          {o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** Style/size apply locally at once; a failed account save says so (#64)
 * — otherwise the next load would quietly revert it. */
function saveStyle(style: Parameters<typeof saveReaderStyle>[0]) {
  saveReaderStyle(style).catch((e: unknown) => notifyError(e, { retry: () => saveStyle(style) }));
}
function saveSize(size: Parameters<typeof saveTextSize>[0]) {
  saveTextSize(size).catch((e: unknown) => notifyError(e, { retry: () => saveSize(size) }));
}

function SettingsContent({
  email,
  onDelete,
  onShortcuts,
}: {
  email: string;
  onDelete: () => void;
  /** Keyboard users only (desktop): opens the shortcuts list. */
  onShortcuts?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const ids = useId();
  const theme = useThemePref();
  const style = useReaderStyle();
  const textSize = useTextSize();
  const lang = i18n.language.startsWith("da") ? "da" : "en";
  const themeIcon = { light: <Sun />, dark: <Moon />, system: <Monitor /> };

  return (
    <div className="flex flex-col text-control">
      <div className="min-w-0 py-1">
        <p className="text-meta text-muted-foreground">{t("settings.signedInAs")}</p>
        <p className="truncate">{email}</p>
      </div>

      <Separator className="my-2" />

      <SettingRow label={t("settings.theme")} labelId={`${ids}-theme`}>
        <Segmented
          value={theme}
          labelledBy={`${ids}-theme`}
          onChange={setThemePref}
          options={THEME_PREFS.map((p) => ({
            value: p,
            label: t(`theme.${p}`),
            icon: themeIcon[p],
          }))}
        />
      </SettingRow>

      <SettingRow label={t("settings.style")} labelId={`${ids}-style`}>
        <Segmented
          value={style}
          labelledBy={`${ids}-style`}
          onChange={saveStyle}
          options={READER_STYLES.map((s) => ({ value: s, label: t(`readerStyle.${s}`) }))}
        />
      </SettingRow>

      {/* Text size (#61): applies live (the page re-lays out), saved to the account */}
      <SettingRow label={t("settings.textSize")} labelId={`${ids}-size`}>
        <Segmented
          value={String(textSize)}
          labelledBy={`${ids}-size`}
          onChange={(s) => saveSize(Number(s) as typeof textSize)}
          options={TEXT_SIZES.map((s) => ({ value: String(s), label: `${s}%` }))}
        />
      </SettingRow>

      <SettingRow label={t("settings.language")} labelId={`${ids}-lang`}>
        {/* Each language named in itself: findable whatever the UI language */}
        <Segmented
          value={lang}
          labelledBy={`${ids}-lang`}
          onChange={(l) => setUiLanguage(l)}
          options={[
            { value: "en", label: "English" },
            { value: "da", label: "Dansk" },
          ]}
        />
      </SettingRow>

      {onShortcuts && (
        <Button variant="ghost" className="h-10 justify-between px-0 hover:bg-transparent hover:underline" onClick={onShortcuts}>
          {t("nav.shortcuts")}
          <kbd data-slot="kbd" className="rounded border border-border bg-muted px-1.5 font-mono text-meta leading-5">
            ?
          </kbd>
        </Button>
      )}

      <Separator className="my-2" />

      {/* The one-time support notice, findable again (Instagram, new tab) */}
      <div className="flex flex-col gap-2 py-1">
        <p className="text-meta text-muted-foreground">{t("support.settings")}</p>
        <SupportLinks quiet />
      </div>

      <Separator className="my-2" />

      <Button
        variant="ghost"
        className="h-10 justify-start px-0 text-destructive hover:bg-transparent hover:text-destructive hover:underline max-sm:h-12"
        onClick={onDelete}
      >
        {t("settings.deleteAccount")}
      </Button>

      {/* Muted footer line (#62); real bundle version + channel arrive with OTA (#19) */}
      <p className="pt-1 text-meta text-muted-foreground">
        {t("settings.version")} {appVersion} · {appChannel} ·{" "}
        <Link to="/privacy" className="underline-offset-2 hover:text-foreground hover:underline">
          {t("settings.privacy")}
        </Link>
      </p>
    </div>
  );
}

/** Delete account (App Store 5.1.1(v)), #62: an AlertDialog that keeps the
 * typed confirm — DELETE /api/account → sign out → /signin. Focus starts in
 * the confirm field and returns to the account chip on cancel. */
function DeleteAccountDialog({
  open,
  onOpenChange,
  returnFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocus: React.RefObject<HTMLButtonElement | null>;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const inputId = useId();
  const [word, setWord] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const confirmWord = t("settings.deleteConfirmWord");
  const armed = word.trim().toLowerCase() === confirmWord;

  function change(next: boolean) {
    if (busy) return;
    if (!next) {
      setWord("");
      setError(false);
    }
    onOpenChange(next);
  }

  async function deleteAccount() {
    setBusy(true);
    setError(false);
    try {
      await api("/api/account", { method: "DELETE" });
    } catch {
      setBusy(false);
      setError(true);
      return;
    }
    // The server already revoked every session; clear the cookie client-side
    await authClient.signOut().catch(() => undefined);
    void navigate("/signin");
  }

  return (
    <AlertDialog open={open} onOpenChange={change}>
      <AlertDialogContent finalFocus={returnFocus}>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("settings.deleteTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t("settings.deleteWarning")}</AlertDialogDescription>
        </AlertDialogHeader>
        <form
          className="flex flex-col gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (armed && !busy) void deleteAccount();
          }}
        >
          <label htmlFor={inputId} className="text-meta text-muted-foreground">
            {t("settings.deleteTypeToConfirm", { word: confirmWord })}
          </label>
          <Input
            id={inputId}
            autoComplete="off"
            placeholder={confirmWord}
            value={word}
            onChange={(e) => setWord(e.target.value)}
          />
          {error && (
            <p role="alert" className="text-meta text-destructive">
              {t("settings.deleteError")}
            </p>
          )}
        </form>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{t("settings.deleteCancel")}</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={!armed || busy}
            onClick={() => void deleteAccount()}
          >
            {busy ? t("settings.deleteBusy") : t("settings.deleteConfirm")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
