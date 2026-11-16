import { TRANSLATION_INFO, translationInfo, type Translation } from "@biblestdy/shared";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate } from "react-router";
import { ScrollArea } from "~/components/ui/scroll-area";
import { API_BIBLE_URL } from "~/lib/app-info";
import i18n from "~/lib/i18n";
import { api } from "~/lib/query";

/**
 * Public copyright page (API.Bible ToS §7.1) — NO auth: the landing page's
 * quote links here too. One entry per translation we show: name, the
 * abbreviation exactly as API.Bible's metadata gives it, the rights holder
 * with a link to their site, and their copyright line verbatim (fetched from
 * the metadata, never retyped), set in the terms' citation format (Appendix
 * A: copyrighted; B: public domain). Every page showing Bible text links
 * here, to the entry's #ABBR. Also the Starter plan's citation + link to
 * API.Bible, and the copy/print limit.
 */

export function meta() {
  return [{ title: i18n.t("copyright.metaTitle") }];
}

const isPublicDomain = (tr: Translation) => /^public domain$/i.test(tr.copyright?.trim() ?? "");

/** Static fallback while the metadata can't load: what we know offline. */
const FALLBACK: Translation[] = Object.entries(TRANSLATION_INFO).map(([abbreviation, info]) => ({
  id: abbreviation,
  name: info.name,
  abbreviation,
  language: abbreviation === "BPH" ? "da" : "en",
}));

export default function Copyright() {
  const { t, i18n: { language } } = useTranslation();
  const ui = language.startsWith("da") ? "da" : "en";
  const location = useLocation();
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ["copyright"],
    queryFn: () => api<Translation[]>("/api/copyright"),
    staleTime: 60 * 60 * 1000,
  });
  const translations = query.data ?? (query.isError ? FALLBACK : []);
  // UI language's own translations first, then by name
  const sorted = [...translations].sort(
    (a, b) => Number(b.language === ui) - Number(a.language === ui) || a.name.localeCompare(b.name),
  );

  // Arriving from a credit line (#NIV): bring that entry into view
  const hash = decodeURIComponent(location.hash.slice(1));
  useEffect(() => {
    if (!hash || sorted.length === 0) return;
    document.getElementById(hash)?.scrollIntoView({ block: "start" });
  }, [hash, sorted.length]);

  // Came here from inside the app: back returns there (the reader's place)
  const inApp = location.key !== "default";

  return (
    <main className="h-dvh overflow-hidden">
      <ScrollArea className="h-full">
        <div className="mx-auto max-w-xl px-6 py-12">
          <Link to="/" className="mb-10 flex select-none items-baseline gap-1.5">
            <span className="font-mono text-reading font-semibold tracking-tight text-primary">biblestdy</span>
          </Link>

          <h1 className="font-serif text-title font-medium">{t("copyright.title")}</h1>
          <p className="mt-2 text-control leading-relaxed text-muted-foreground">{t("copyright.intro")}</p>

          {query.isPending && (
            <p className="mt-8 text-control text-muted-foreground" role="status">
              {t("copyright.loading")}
            </p>
          )}
          {query.isError && (
            <p className="mt-8 text-control text-muted-foreground" role="status">
              {t("copyright.loadError")}
            </p>
          )}

          {sorted.map((tr) => {
            const info = translationInfo(tr.abbreviation);
            const vars = { abbr: tr.abbreviation, name: tr.name };
            return (
              <section key={tr.id} id={tr.abbreviation} className="mt-8 scroll-mt-6">
                <h2 className="font-serif text-reading font-medium">
                  {info?.name ?? tr.name} <span className="font-mono text-control text-muted-foreground">({tr.abbreviation})</span>
                </h2>
                {isPublicDomain(tr) ? (
                  <p className="mt-2 text-control leading-relaxed text-muted-foreground">
                    {t("copyright.publicDomain", vars)}
                  </p>
                ) : (
                  <>
                    <p className="mt-2 text-control leading-relaxed text-muted-foreground">
                      {t("copyright.quotations", vars)}{" "}
                      {/* The holder's own words, as the metadata gives them */}
                      {tr.copyright && <span lang="en">{tr.copyright}</span>}
                    </p>
                    <p className="mt-2 text-control leading-relaxed text-muted-foreground">
                      {t("copyright.restrictions", vars)}
                    </p>
                  </>
                )}
                {info?.holder && (
                  <p className="mt-2 text-control leading-relaxed text-muted-foreground">
                    {t(isPublicDomain(tr) ? "copyright.maintainer" : "copyright.holder")}{" "}
                    <a
                      href={info.holder.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      {info.holder.name}
                      <span className="sr-only"> {t("copyright.newTab")}</span>
                    </a>
                  </p>
                )}
              </section>
            );
          })}

          <section className="mt-10 border-t border-border pt-8">
            <h2 className="font-serif text-reading font-medium">{t("copyright.sourceTitle")}</h2>
            <p className="mt-2 text-control leading-relaxed text-muted-foreground">
              {t("copyright.sourceBody")}{" "}
              <a
                href={API_BIBLE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline-offset-2 hover:underline"
              >
                API.Bible
                <span className="sr-only"> {t("copyright.newTab")}</span>
              </a>
              .
            </p>
            <p className="mt-2 text-control leading-relaxed text-muted-foreground">{t("copyright.limits")}</p>
          </section>

          {inApp ? (
            <button
              type="button"
              onClick={() => void navigate(-1)}
              className="mt-12 block text-meta text-muted-foreground hover:text-foreground"
            >
              ← {t("copyright.back")}
            </button>
          ) : (
            <Link to="/" className="mt-12 block text-meta text-muted-foreground hover:text-foreground">
              ← {t("privacy.backToApp")}
            </Link>
          )}
        </div>
      </ScrollArea>
    </main>
  );
}
