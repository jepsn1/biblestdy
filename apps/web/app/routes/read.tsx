import type { Chapter, Translation } from "@biblestdy/shared";
import { formatReference, getBook } from "@biblestdy/shared";
import { data } from "react-router";
import { SidebarInset, SidebarProvider } from "~/components/ui/sidebar";
import { BooksSidebar } from "../reader/books-sidebar";
import { PaginatedChapter } from "../reader/paginated-chapter";
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
  const title = formatReference({
    book: params.book.toUpperCase(),
    chapter: Number(params.chapter),
  });
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
  const book = getBook(chapter.book);
  const chapterCount = book?.chapters ?? 1;
  const prevHref = chapter.chapter > 1 ? `/read/${chapter.book}/${chapter.chapter - 1}` : null;
  const nextHref =
    chapter.chapter < chapterCount ? `/read/${chapter.book}/${chapter.chapter + 1}` : null;

  return (
    <SidebarProvider className="h-dvh overflow-hidden">
      <BooksSidebar book={chapter.book} />
      <SidebarInset className="flex h-full min-w-0 flex-col overflow-hidden">
        <ReaderNav book={chapter.book} chapter={chapter.chapter} />
        <PaginatedChapter
          chapter={chapter}
          translation={translation}
          heading={heading}
          prevHref={prevHref}
          nextHref={nextHref}
        />
      </SidebarInset>
    </SidebarProvider>
  );
}
