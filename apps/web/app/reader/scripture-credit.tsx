import { translationInfo } from "@biblestdy/shared";
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
 * citation (Starter plan). Given the translations quoted, it names them
 * with their rights line instead ("BPH © Biblica 2015; WEB · Public
 * domain", #161).
 */
export function ScriptureCredit({
  className,
  onFollow,
  quoted,
  replace,
}: {
  className?: string;
  onFollow?: () => void;
  /** The copyright page takes this history entry's place (the phone
   * search screen's own entry, #243). */
  replace?: boolean;
  /** Abbreviations of the translations the words shown come from. */
  quoted?: readonly string[];
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith("da") ? "da" : "en";
  const named = quoted
    ?.map((abbr) => {
      const rights = translationInfo(abbr)?.rights[lang];
      if (!rights) return abbr;
      return rights.startsWith("©") ? `${abbr} ${rights}` : `${abbr} · ${rights}`;
    })
    .join("; ");
  return (
    <p className={cn("text-meta text-muted-foreground", className)}>
      <Link to="/copyright" replace={replace} className={LINK} onClick={onFollow}>
        {named || t("copyright.quoted")}
      </Link>
      {" · "}
      <a href={API_BIBLE_URL} target="_blank" rel="noopener noreferrer" className={LINK}>
        {t("copyright.via")}
        <span className="sr-only"> {t("copyright.newTab")}</span>
      </a>
    </p>
  );
}
