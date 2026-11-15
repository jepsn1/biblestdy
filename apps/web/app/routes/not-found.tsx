import { useTranslation } from "react-i18next";
import { BookOpen } from "lucide-react";
import { Link } from "react-router";
import { buttonVariants } from "~/components/ui/button";
import { ErrorScreen } from "~/components/error-page";
import { readingHref } from "../reader/chapter-nav";
import i18n from "~/lib/i18n";
import { cn } from "~/lib/utils";

export function meta() {
  return [
    { title: `${i18n.t("error.notFoundTitle")} — biblestdy` },
    // An SPA's "not found" still answers 200: keep it out of search results
    { name: "robots", content: "noindex" },
  ];
}

/** Any URL no route knows: public (no sign-in needed to be told it's not
 * here), with a way back to the reader and to the front page. */
export default function NotFound() {
  const { t } = useTranslation();
  return (
    <ErrorScreen title={t("error.notFoundTitle")} message={t("error.notFoundBody")}>
      <Link to={readingHref()} className={cn(buttonVariants({ size: "lg" }), "h-10 px-4")}>
        <BookOpen aria-hidden />
        {t("error.backToReading")}
      </Link>
      <Link to="/" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-10 px-4")}>
        {t("error.home")}
      </Link>
    </ErrorScreen>
  );
}
