import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { ScrollArea } from "~/components/ui/scroll-area";
import i18n from "~/lib/i18n";

/** Public privacy policy (issue #17) — NO auth: the App Store listing and
 * curious visitors read it signed out. Support contact = the same mailto. */

export function meta() {
  return [{ title: i18n.t("privacy.metaTitle") }];
}

const SUPPORT_EMAIL = "support@biblestdy.com";

export default function Privacy() {
  const { t } = useTranslation();

  return (
    <main className="h-dvh overflow-hidden">
      <ScrollArea className="h-full">
        <div className="mx-auto max-w-xl px-6 py-12">
          <Link to="/" className="mb-10 flex select-none items-baseline gap-1.5">
            <span className="font-mono text-lg font-semibold tracking-tight text-primary">
              biblestdy
            </span>
          </Link>

          <h1 className="font-serif text-2xl font-medium">{t("privacy.title")}</h1>
          <p className="mt-1 font-mono text-[0.65rem] text-muted-foreground">
            {t("privacy.updated")} 2026-09-09
          </p>

          <section className="mt-8">
            <h2 className="font-serif text-lg font-medium">{t("privacy.storeTitle")}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {t("privacy.storeBody")}
            </p>
          </section>

          <section className="mt-8">
            <h2 className="font-serif text-lg font-medium">{t("privacy.trackTitle")}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {t("privacy.trackBody")}
            </p>
          </section>

          <section className="mt-8">
            <h2 className="font-serif text-lg font-medium">{t("privacy.deleteTitle")}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {t("privacy.deleteBody")}
            </p>
          </section>

          <section className="mt-8">
            <h2 className="font-serif text-lg font-medium">{t("privacy.contactTitle")}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {t("privacy.contactBody")}
            </p>
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="mt-1 inline-block font-mono text-sm text-primary hover:underline"
            >
              {SUPPORT_EMAIL}
            </a>
          </section>

          <Link
            to="/"
            className="mt-12 block font-mono text-[0.65rem] text-muted-foreground hover:text-foreground"
          >
            ← {t("privacy.backToApp")}
          </Link>
        </div>
      </ScrollArea>
    </main>
  );
}
