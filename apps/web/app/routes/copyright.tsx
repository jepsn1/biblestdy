import { TRANSLATION_INFO, translationInfo, type Translation } from "@biblestdy/shared";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate } from "react-router";
import { ScrollArea } from "~/components/ui/scroll-area";
import { API_BIBLE_URL } from "~/lib/app-info";
import i18n from "~/lib/i18n";
import { api } from "~/lib/query";
import { cn, focusRing } from "~/lib/utils";

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
  // Offline: the terms' short form ("NIV © Biblica 2011"); the full lines
  // come from the metadata
  copyright: info.rights.en === "Public domain" ? "PUBLIC DOMAIN" : `${abbreviation} ${info.rights.en}`,
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
  // (and focus its heading, so a screen reader starts there too); no hash:
  // focus the page's heading. A mangled hash is just no hash.
  let hash = "";
  try {
    hash = decodeURIComponent(location.hash.slice(1));
  } catch {
    // keep ""
  }
  useEffect(() => {
    if (sorted.length === 0) return;
    const entry = hash ? document.getElementById(hash) : null;
    entry?.scrollIntoView({ block: "start" });
    const heading = entry?.querySelector<HTMLElement>("h2") ?? document.getElementById("copyright-title");
    heading?.focus({ preventScroll: true });
  }, [hash, sorted.length]);

  // Came here from inside the app: back returns there (the reader's place,
  // named when the credit line passed it: "Back to John 3")
  const inApp = location.key !== "default";
  const from = (location.state as { from?: unknown } | null)?.from;
  const back = inApp ? (
    <button
      type="button"
      onClick={() => void navigate(-1)}
      className={cn("-ml-2 inline-flex min-h-11 items-center rounded-md px-2 text-control text-muted-foreground hover:text-foreground", focusRing)}
    >
      ← {typeof from === "string" ? t("copyright.backTo", { ref: from }) : t("copyright.back")}
    </button>
  ) : (
    <Link to="/" className={cn("-ml-2 inline-flex min-h-11 items-center rounded-md px-2 text-control text-muted-foreground hover:text-foreground", focusRing)}>
      ← {t("privacy.backToApp")}
    </Link>
  );

  return (
    <main className="h-dvh overflow-hidden">
      <ScrollArea className="h-full">
        <div className="mx-auto max-w-xl px-6 py-12">
          {/* The way back first: a tap on a credit line lands here */}
          <div className="mb-8 flex items-center justify-between gap-4">
            {back}
            <Link to="/" className="flex select-none items-baseline gap-1.5">
              <span className="font-mono text-reading font-semibold tracking-tight text-primary">biblestdy</span>
            </Link>
          </div>

          <h1 id="copyright-title" tabIndex={-1} className="font-serif text-title font-medium outline-none">
            {t("copyright.title")}
          </h1>
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
              // The entry the credit line led to is marked (a rule, no motion)
              <section
                key={tr.id}
                id={tr.abbreviation}
                data-current={tr.abbreviation === hash || undefined}
                className="mt-8 scroll-mt-6 data-current:-ml-4 data-current:border-l-2 data-current:border-primary data-current:pl-3.5"
              >
                <h2 tabIndex={-1} className="font-serif text-reading font-medium outline-none">
                  {info?.name ?? tr.name} <span className="font-mono text-control text-muted-foreground">({tr.abbreviation})</span>
                </h2>
                {isPublicDomain(tr) ? (
                  <p className="mt-2 text-control leading-relaxed text-muted-foreground">
                    {t("copyright.publicDomain", vars)}
                  </p>
                ) : (
                  <>
                    <p className="mt-2 text-control leading-relaxed text-muted-foreground">
                      {t("copyright.quotations", vars)}
                    </p>
                    {/* The holder's own words, verbatim from the metadata —
                        set apart from our sentences around them */}
                    {tr.copyright && (
                      <blockquote lang="en" className="mt-2 border-l-2 border-border pl-3 text-control leading-relaxed text-foreground">
                        {tr.copyright}
                      </blockquote>
                    )}
                    <p className="mt-2 text-control leading-relaxed text-muted-foreground">
                      {/* The template's "Used by permission. All rights
                          reserved." unless the holder's line says it already */}
                      {!/all rights reserved/i.test(tr.copyright ?? "") && `${t("copyright.reserved")} `}
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

          {/* Third-party notices: the versification map (#166) ships in the
              app, and its MIT notice must go with it (the minified chunk
              drops comments) */}
          <section className="mt-10 border-t border-border pt-8">
            <h2 className="font-serif text-reading font-medium">{NOTICES[language.startsWith("da") ? "da" : "en"].title}</h2>
            <p className="mt-2 text-control leading-relaxed text-muted-foreground">{NOTICES[language.startsWith("da") ? "da" : "en"].versification}</p>
            <pre lang="en" className="mt-3 font-mono text-meta leading-relaxed whitespace-pre-wrap text-muted-foreground">
              {LIBPALASO_LICENSE}
            </pre>
          </section>

          <div className="mt-12">{back}</div>
        </div>
      </ScrollArea>
    </main>
  );
}

/** SIL libpalaso's licence (tools/versification/LICENSE-libpalaso.txt),
 * verbatim: the verse-numbering data comes from its eng.vrs / org.vrs. */
const LIBPALASO_LICENSE = `The MIT License (MIT)

Copyright (c) 2007-2026 SIL Global

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`;

/** The notices' own words, here rather than in locales/ (they'd ride in
 * every page's first load otherwise). */
const NOTICES = {
  en: { title: "Third-party notices", versification: "How verses are numbered in each Bible (used to line up translations) comes from SIL libpalaso’s versification files, used under the MIT licence:" },
  da: { title: "Tredjepartsmeddelelser", versification: "Hvordan versene er nummereret i hver bibel (bruges til at stille oversættelser over for hinanden), stammer fra SIL libpalasos versifikationsfiler og bruges under MIT-licensen:" },
};
