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
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <ReaderNav book={chapter.book} chapter={chapter.chapter} />
      <main className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="mb-8 font-serif text-3xl font-semibold tracking-tight">{heading}</h1>
        <div className="font-serif text-lg leading-8">
          {chapter.verses.map((v) => (
            <span key={v.verse} data-verse={v.verse}>
              <sup className="mr-1 select-none align-super text-xs font-sans text-stone-400">
                {v.verse}
              </sup>
              {v.text}{" "}
            </span>
          ))}
        </div>
        <footer className="mt-10 text-xs text-stone-400">
          {translation.name}
          {chapter.copyright ? ` · ${chapter.copyright}` : ""}
        </footer>
      </main>
    </div>
  );
}
