import { ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
import { GROUP_CHAT_URL, INSTAGRAM_HANDLE, INSTAGRAM_URL } from "~/lib/support";
import { cn, focusRing } from "~/lib/utils";

const LINK = cn(
  "inline-flex min-h-9 items-center gap-1.5 rounded text-control text-muted-foreground underline-offset-2 hover:text-foreground hover:underline max-sm:min-h-11",
  focusRing,
);

/** "Support biblestdy" in Settings: two quiet text links (new tab — the
 * reading page stays). Found when looked for, never pushed. */
export function SupportLinks() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col py-1">
      <p className="text-control font-medium">{t("support.settings")}</p>
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
