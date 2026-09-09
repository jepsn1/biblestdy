import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";
import { UserRound } from "lucide-react";
import { ThemeToggle } from "~/components/theme-toggle";
import { Button } from "~/components/ui/button";
import { Drawer, DrawerContent } from "~/components/ui/drawer";
import { Input } from "~/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Separator } from "~/components/ui/separator";
import { useIsMobile } from "~/hooks/use-mobile";
import { appChannel, appVersion } from "~/lib/app-info";
import { authClient } from "~/lib/auth-client";
import { setUiLanguage } from "~/lib/i18n";
import { api } from "~/lib/query";

const chipClass =
  "flex size-6 shrink-0 select-none items-center justify-center rounded-full bg-primary/15 font-mono text-[0.65rem] font-semibold text-primary transition-colors hover:bg-primary/25";

/** Account chip at the end of the reader nav (issue #17): opens the settings
 * surface — email, theme + language (moved out of the nav), version/channel,
 * privacy link, and the account delete danger zone. Popover on desktop,
 * bottom drawer on phones (the app's mobile-panel pattern). */
export function AccountChip() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const { data: session } = authClient.useSession();
  const email = session?.user.email ?? "";
  const initial = email ? (
    email[0].toUpperCase()
  ) : (
    <UserRound className="size-3.5" />
  );

  if (isMobile) {
    return (
      <>
        <button
          type="button"
          aria-label={t("settings.open")}
          title={t("settings.open")}
          className={chipClass}
          onClick={() => setOpen(true)}
        >
          {initial}
        </button>
        <Drawer open={open} onOpenChange={setOpen} showSwipeHandle>
          <DrawerContent style={{ "--drawer-height": "80dvh" } as React.CSSProperties}>
            <ScrollArea className="h-full">
              <div className="px-4 pt-1 pb-8">
                <SettingsContent email={email} />
              </div>
            </ScrollArea>
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={t("settings.open")}
            title={t("settings.open")}
            className={chipClass}
          />
        }
      >
        {initial}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <SettingsContent email={email} />
      </PopoverContent>
    </Popover>
  );
}

function SettingsContent({ email }: { email: string }) {
  const { t, i18n } = useTranslation();

  return (
    <div className="flex flex-col gap-3 p-1 text-sm">
      <div className="min-w-0">
        <p className="font-mono text-[0.6rem] tracking-wide text-muted-foreground uppercase">
          {t("settings.signedInAs")}
        </p>
        <p className="truncate font-mono text-xs">{email}</p>
      </div>

      <Separator />

      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{t("settings.theme")}</span>
        <ThemeToggle />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{t("settings.language")}</span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("settings.language")}
          onClick={() => setUiLanguage(i18n.language.startsWith("da") ? "en" : "da")}
        >
          <span className="font-mono text-[0.6rem] font-semibold">
            {i18n.language.startsWith("da") ? "DA" : "EN"}
          </span>
        </Button>
      </div>

      {/* Real bundle version + channel arrive with the OTA slice (#19) */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{t("settings.version")}</span>
        <span className="font-mono text-[0.65rem] text-muted-foreground">
          {appVersion} · {appChannel}
        </span>
      </div>

      <Link
        to="/privacy"
        className="font-mono text-[0.65rem] text-muted-foreground hover:text-foreground"
      >
        {t("settings.privacy")}
      </Link>

      <Separator />

      <DangerZone />
    </div>
  );
}

/** Delete account (App Store 5.1.1(v)): explicit typed confirm, then
 * DELETE /api/account → sign out → /signin. */
function DangerZone() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [word, setWord] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const confirmWord = t("settings.deleteConfirmWord");
  const armed = word.trim().toLowerCase() === confirmWord;

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

  if (!confirming) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="justify-start px-0 text-destructive hover:text-destructive"
        onClick={() => setConfirming(true)}
      >
        {t("settings.deleteAccount")}
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2.5">
      <p className="font-mono text-[0.6rem] tracking-wide text-destructive uppercase">
        {t("settings.dangerZone")}
      </p>
      <p className="text-xs text-muted-foreground">{t("settings.deleteWarning")}</p>
      <Input
        autoFocus
        aria-label={t("settings.deleteTypeToConfirm", { word: confirmWord })}
        placeholder={confirmWord}
        value={word}
        onChange={(e) => setWord(e.target.value)}
        className="h-7 font-mono text-xs"
      />
      <p className="text-[0.65rem] text-muted-foreground">
        {t("settings.deleteTypeToConfirm", { word: confirmWord })}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="destructive"
          size="sm"
          disabled={!armed || busy}
          onClick={() => void deleteAccount()}
        >
          {busy ? t("settings.deleteBusy") : t("settings.deleteConfirm")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => {
            setConfirming(false);
            setWord("");
            setError(false);
          }}
        >
          {t("settings.deleteCancel")}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{t("settings.deleteError")}</p>}
    </div>
  );
}
