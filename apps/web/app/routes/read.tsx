import type { Chapter, Translation } from "@biblestdy/shared";
import { formatReference } from "@biblestdy/shared";
import { data } from "react-router";
import { ReaderNav } from "../reader/reader-nav";
import type { Route } from "./+types/read";

// v1 slice: single translation — whatever the API offers first.
let translationCache: Translation | undefined;

async function defaultTranslation(): Promise<Translation> {
  if (translationCache) return translationCache;
  const res = await fetch("/api/translations");
  if (!res.ok) throw data("Could not load translations", { status: 502 });
  const translations = (await res.json()) as Translation[];
  if (translations.length === 0) throw data("No translations available", { status: 502 });
  translationCache = translations[0];
  return translationCache;
}

export function meta({ params }: Route.MetaArgs) {
  const title = formatReference({ book: params.book.toUpperCase(), chapter: Number(params.chapter) });
  return [{ title: `${title} — biblestdy` }];
}

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const translation = await defaultTranslation();
  const res = await fetch(`/api/passages/${translation.id}/${params.book}/${params.chapter}`);
  if (res.status === 404 || res.status === 400) {
    throw data(`This chapter isn't available (yet).`, { status: 404 });
  }
  if (!res.ok) throw data("Could not load the chapter", { status: 502 });
  const chapter = (await res.json()) as Chapter;
  return { chapter, translation };
}

export default function Read({ loaderData }: Route.ComponentProps) {
  const { chapter, translation } = loaderData;
  const heading = formatReference({ book: chapter.book, chapter: chapter.chapter });

  return (
    <div className="min-h-screen">
      <ReaderNav book={chapter.book} chapter={chapter.chapter} />
      <main className="mx-auto max-w-2xl px-6 py-12 lg:max-w-5xl">
        <h1 className="mb-10 font-serif text-3xl font-medium tracking-tight">{heading}</h1>
        {/* Two-column book spread on large screens; text flows col 1 → col 2 */}
        <div className="font-serif text-lg leading-9 text-foreground/95 lg:columns-2 lg:gap-x-16 lg:[column-rule:1px_solid_var(--border)]">
          {chapter.verses.map((v) => (
            <span key={v.verse} data-verse={v.verse}>
              <sup className="mr-1.5 select-none align-super font-sans text-[0.65rem] font-medium text-primary/70">
                {v.verse}
              </sup>
              {v.text}{" "}
            </span>
          ))}
        </div>
        <footer className="mt-12 flex items-center justify-between gap-4 border-t border-border pt-4 font-mono text-[0.65rem] text-muted-foreground">
          <span>
            {chapter.book}.{chapter.chapter} · {chapter.verses.length} verses ·{" "}
            {translation.abbreviation}
            {chapter.copyright ? ` · ${chapter.copyright}` : ""}
          </span>
          <span className="hidden shrink-0 items-center gap-1 sm:flex">
            <kbd className="rounded border border-border bg-muted px-1">←</kbd>
            <kbd className="rounded border border-border bg-muted px-1">→</kbd>
            chapters
          </span>
        </footer>
      </main>
    </div>
  );
}
