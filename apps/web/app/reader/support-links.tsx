import { ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
import { COFFEE_URL, GROUP_CHAT_URL, INSTAGRAM_HANDLE, INSTAGRAM_URL } from "~/lib/support";
import { cn, focusRing } from "~/lib/utils";
import { ShareMenu } from "./share-menu";

const LINK = cn(
  "inline-flex min-h-9 items-center gap-1.5 rounded text-control text-muted-foreground underline-offset-2 hover:text-foreground hover:underline max-sm:min-h-12 max-sm:w-full max-sm:[&>svg]:ml-auto",
  focusRing,
);

/** "Support biblestdy" in Settings: quiet text links (new tab — the
 * reading page stays) and Share with a friend (#182). Found when looked
 * for, never pushed. */
export function SupportLinks() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col py-1">
      <p className="text-control font-medium">{t("support.settings")}</p>
      <a href={COFFEE_URL} target="_blank" rel="noopener noreferrer" className={LINK}>
        <span aria-hidden>☕</span>
        {t("support.coffee")}
        <ExternalLink className="size-3.5" aria-hidden />
        <span className="sr-only">{t("copyright.newTab")}</span>
      </a>
      <ShareMenu align="start" side="bottom" className={cn(LINK, "cursor-pointer self-start")}>
        <span aria-hidden>↗</span>
        {t("share.friend")}
      </ShareMenu>
      <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" className={LINK}>
        {t("support.follow", { handle: INSTAGRAM_HANDLE })}
        <ExternalLink className="size-3.5" aria-hidden />
        <span className="sr-only">{t("copyright.newTab")}</span>
      </a>
      <a href={GROUP_CHAT_URL} target="_blank" rel="noopener noreferrer" className={LINK}>
        {t("support.chat")}
        <ExternalLink className="size-3.5" aria-hidden />
        <span className="sr-only">{t("copyright.newTab")}</span>
      </a>
    </div>
  );
}
