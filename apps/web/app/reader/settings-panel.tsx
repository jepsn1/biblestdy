import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";
import { HIGHLIGHT_COLORS, READER_STYLES, TEXT_SIZES } from "@biblestdy/shared";
import { ChevronRight, LogOut, Monitor, Moon, Sun } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Separator } from "~/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { API_BIBLE_URL, appChannel, appVersion } from "~/lib/app-info";
import { authClient } from "~/lib/auth-client";
import { clearAllDrafts } from "~/lib/note-drafts";
import { setUiLanguage } from "~/lib/i18n";
import { useLiveShortcut } from "~/lib/shortcuts";
import { saveReaderStyle, useReaderStyle } from "~/lib/reader-style";
import { saveTextSize, useTextSize } from "~/lib/text-size";
import { setThemePref, THEME_PREFS, useThemePref } from "~/lib/theme";
import { notifyError } from "~/lib/notify";
import i18n from "~/lib/i18n";
import { InlineNotice } from "~/components/inline-notice";
import { cn, focusRing } from "~/lib/utils";
import { api } from "~/lib/query";
import { HIGHLIGHT_SWATCH } from "./highlight-colors";
import { SingleKeysSwitch } from "./shortcuts-dialog";
import { SupportLinks } from "./support-links";
import { showToursAgain } from "../notes/tour-replay";

/*
 * The settings surface's rows and its two confirms (account-settings.tsx
 * owns the chip, popover and drawer). Code-split: it loads when the reader
 * is idle or reaches for the chip, never in the first paint (bundle budget).
 */

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
  saveReaderStyle(style).catch((e: unknown) =>
    notifyError(e, {
      place: "settings",
      // What's in effect (#257 panel D7): this device has it, the account not
      message: i18n.t("notice.styleNotSaved", { value: i18n.t(`readerStyle.${style}`) }),
      retry: () => saveStyle(style),
    }),
  );
}
function saveSize(size: Parameters<typeof saveTextSize>[0]) {
  saveTextSize(size).catch((e: unknown) =>
    notifyError(e, { place: "settings", message: i18n.t("notice.sizeNotSaved", { value: `${size}%` }), retry: () => saveSize(size) }),
  );
}

export function SettingsContent({
  email,
  onSignOut,
  onDelete,
  onColorNames,
  onShortcuts,
  onReplayTour,
}: {
  email: string;
  onSignOut: () => void;
  onDelete: () => void;
  onColorNames: () => void;
  /** Keyboard users only (desktop): opens the shortcuts list. */
  onShortcuts?: () => void;
  /** Before the notes tours start again (#162): the settings close. */
  onReplayTour: () => void;
}) {
  const { t, i18n } = useTranslation();
  const ids = useId();
  const theme = useThemePref();
  const style = useReaderStyle();
  const textSize = useTextSize();
  const lang = i18n.language.startsWith("da") ? "da" : "en";
  const helpKey = useLiveShortcut()("?");
  const themeIcon = { light: <Sun />, dark: <Moon />, system: <Monitor /> };

  return (
    <div className="flex flex-col text-control">
      {/* A setting that didn't save says so here (#257), naming what's in effect */}
      <InlineNotice place="settings" lineClassName="justify-start py-1 text-left" />
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 py-1">
        <div className="min-w-0">
          <p className="text-meta text-muted-foreground">{t("settings.signedInAs")}</p>
          <p className="truncate">{email}</p>
        </div>
        <Button variant="outline" size="sm" className="shrink-0 gap-1.5 [--btn-h-fine:2rem]" aria-haspopup="dialog" onClick={onSignOut}>
          <LogOut aria-hidden />
          {t("settings.signOut")}
        </Button>
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

      {/* Highlight colours: the reader's own names ("blue = God speaking") */}
      <SettingRow label={t("colorNames.setting")} labelId={`${ids}-colors`}>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 max-sm:h-9"
          aria-describedby={`${ids}-colors`}
          aria-haspopup="dialog"
          onClick={onColorNames}
        >
          <span aria-hidden className="flex -space-x-1">
            {HIGHLIGHT_COLORS.map((c) => (
              <span
                key={c}
                className="size-3 rounded-full ring-1 ring-popover"
                style={{ background: HIGHLIGHT_SWATCH[c] }}
              />
            ))}
          </span>
          {t("colorNames.edit")}
        </Button>
      </SettingRow>

      {/* Every note, all in one place (was the sidebar's "Notes" link) —
          never just "Notes": that's the panel for this chapter */}
      <Link
        to="/notes"
        className="flex h-10 items-center justify-between text-control underline-offset-2 hover:underline max-sm:h-12"
      >
        {t("palette.allNotes")}
        <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
      </Link>

      {onShortcuts && (
        <Button variant="ghost" className="h-10 justify-between px-0 hover:bg-transparent hover:underline" onClick={onShortcuts}>
          {t("nav.shortcuts")}
          {helpKey && (
            <kbd data-slot="kbd" className="rounded border border-border bg-muted px-1.5 font-mono text-meta leading-5">
              {helpKey}
            </kbd>
          )}
        </Button>
      )}

      {/* The notes tours (#162): note + Notes page, from the start */}
      <Button variant="ghost" className="h-10 justify-between px-0 hover:bg-transparent hover:underline max-sm:h-12" onClick={() => {
          onReplayTour();
          showToursAgain();
        }}>
        {t("tour.replay")}
        {/* A row that goes somewhere in the app: › (#262 D7) */}
        <ChevronRight className="text-muted-foreground" aria-hidden />
      </Button>

      {/* WCAG 2.1.4 (#145): every device — an iPad with a keyboard fires them too */}
      <SingleKeysSwitch />

      <Separator className="my-2" />

      {/* Support: a quiet link, found when looked for (Non-Commercial Agreement) */}
      <SupportLinks />

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
        <Link to="/privacy" className={FOOT_LINK}>
          {t("settings.privacy")}
        </Link>{" "}
        ·{" "}
        <Link to="/copyright" className={FOOT_LINK}>
          {t("copyright.link")}
        </Link>{" "}
        ·{" "}
        <a href={API_BIBLE_URL} target="_blank" rel="noopener noreferrer" className={FOOT_LINK}>
          {t("copyright.via")}
          <span className="sr-only"> {t("copyright.newTab")}</span>
        </a>
      </p>
    </div>
  );
}

/** Settings' muted footer links: whole items, real targets on phones. */
const FOOT_LINK = cn("rounded-sm whitespace-nowrap underline-offset-2 hover:text-foreground hover:underline max-sm:inline-block max-sm:py-1.5", focusRing);

/** Delete account (App Store 5.1.1(v)), #62: an AlertDialog that keeps the
 * typed confirm — DELETE /api/account → sign out → /signin. Focus starts in
 * the confirm field and returns to the chip (or More) on cancel. */
export function DeleteAccountDialog({
  open,
  onOpenChange,
  returnFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocus: () => HTMLElement | null;
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
    clearAllDrafts();
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

/** Log out, confirmed (#64; moved from the books sidebar): to sign in again
 * takes a new email code. Unsaved note drafts stay with their owner. */
export function SignOutDialog({
  open,
  onOpenChange,
  returnFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocus: () => HTMLElement | null;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent finalFocus={returnFocus}>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("settings.signOutTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t("settings.signOutWarning")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("settings.signOutCancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() =>
              void authClient
                .signOut()
                .then(() => {
                  clearAllDrafts();
                  return navigate("/signin");
                })
                .catch((e: unknown) => notifyError(e, { place: "settings", message: t("notice.signOutFailed") }))
            }
          >
            {t("settings.signOut")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
