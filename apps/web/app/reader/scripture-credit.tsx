import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { API_BIBLE_URL } from "~/lib/app-info";
import { cn, focusRing } from "~/lib/utils";

const LINK = cn(
  "rounded-sm underline-offset-2 hover:text-foreground hover:underline pointer-coarse:underline pointer-coarse:decoration-muted-foreground/40",
  focusRing,
);

/**
 * One muted line where quoted Bible words appear outside the reader's own
 * page (note references, search results): "Bible text: copyright · Text via API.Bible"
 * — the copyright page link every such page needs (ToS §7.2) and the source
 * citation (Starter plan).
 */
export function ScriptureCredit({ className, onFollow }: { className?: string; onFollow?: () => void }) {
  const { t } = useTranslation();
  return (
    <p className={cn("text-meta text-muted-foreground", className)}>
      <Link to="/copyright" className={LINK} onClick={onFollow}>
        {t("copyright.quoted")}
      </Link>
      {" · "}
      <a href={API_BIBLE_URL} target="_blank" rel="noopener noreferrer" className={LINK}>
        {t("copyright.via")}
        <span className="sr-only"> {t("copyright.newTab")}</span>
      </a>
    </p>
  );
}
