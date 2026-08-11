import type { Chapter, Translation } from "@biblestdy/shared";
import { formatReference, getBook } from "@biblestdy/shared";
import { useState } from "react";
import { data, useRevalidator } from "react-router";
import { SidebarInset, SidebarProvider } from "~/components/ui/sidebar";
import i18n from "~/lib/i18n";
import { requireAuth } from "~/lib/require-auth";
import { BooksSidebar } from "../reader/books-sidebar";
import { PaginatedChapter } from "../reader/paginated-chapter";
import { ReaderNav } from "../reader/reader-nav";
import type { Route } from "./+types/read";

let translationsCache: Translation[] | undefined;

async function loadTranslations(): Promise<Translation[]> {
  if (translationsCache) return translationsCache;
  const res = await fetch("/api/translations");
  if (!res.ok) throw data(i18n.t("error.translationsLoad"), { status: 502 });
  const translations = (await res.json()) as Translation[];
  if (translations.length === 0) throw data(i18n.t("error.noTranslations"), { status: 502 });
  translationsCache = translations;
  return translations;
}

/** The reading translation (#11): sticky preference, first offered as default. */
function pickTranslation(translations: Translation[]): Translation {
  const preferred =
    typeof localStorage !== "undefined" ? localStorage.getItem("translationId") : null;
  return translations.find((t) => t.id === preferred) ?? translations[0];
}

export function meta({ params }: Route.MetaArgs) {
  const title = formatReference({
    book: params.book.toUpperCase(),
    chapter: Number(params.chapter),
  });
  return [{ title: `${title} — biblestdy` }];
}

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  await requireAuth();
  const translations = await loadTranslations();
  const translation = pickTranslation(translations);
  const res = await fetch(`/api/passages/${translation.id}/${params.book}/${params.chapter}`);
  if (res.status === 404 || res.status === 400) {
    throw data(i18n.t("error.chapterUnavailable"), { status: 404 });
  }
  if (!res.ok) throw data(i18n.t("error.chapterLoad"), { status: 502 });
  const chapter = (await res.json()) as Chapter;
  // Only a chapter that actually loaded may become the launch page
  localStorage.setItem("lastRead", `${chapter.book}/${chapter.chapter}`);
  return { chapter, translation, translations };
}

export default function Read({ loaderData }: Route.ComponentProps) {
  const { chapter, translation, translations } = loaderData;
  const revalidator = useRevalidator();
  function switchTranslation(id: string) {
    localStorage.setItem("translationId", id);
    void revalidator.revalidate(); // reloads the chapter in the new version
  }
  const heading = formatReference({ book: chapter.book, chapter: chapter.chapter });
  const book = getBook(chapter.book);
  const chapterCount = book?.chapters ?? 1;
  const prevHref = chapter.chapter > 1 ? `/read/${chapter.book}/${chapter.chapter - 1}` : null;
  const nextHref =
    chapter.chapter < chapterCount ? `/read/${chapter.book}/${chapter.chapter + 1}` : null;
  // ONE side slot, content switches: 'connections' | a note id | null.
  // Connections open/closed is the sticky ambient preference; a note borrows
  // the slot and closing it falls back to that preference.
  const [sideView, setSideView] = useState<string | null>(() =>
    typeof localStorage !== "undefined" && localStorage.getItem("connectionsOpen") === "1"
      ? "connections"
      : null,
  );
  function toggleConnections() {
    setSideView((view) => {
      // From a note, Waypoints switches BACK to connections (never closes)
      const next = view === "connections" ? null : "connections";
      localStorage.setItem("connectionsOpen", next ? "1" : "0");
      return next;
    });
  }

  return (
    <SidebarProvider className="h-dvh overflow-hidden">
      <BooksSidebar book={chapter.book} />
      <SidebarInset className="flex h-full min-w-0 flex-col overflow-hidden">
        <ReaderNav
          book={chapter.book}
          chapter={chapter.chapter}
          translations={translations}
          translationId={translation.id}
          onSwitchTranslation={switchTranslation}
          connectionsOpen={sideView === "connections"}
          onToggleConnections={toggleConnections}
        />
        <PaginatedChapter
          chapter={chapter}
          translation={translation}
          heading={heading}
          prevHref={prevHref}
          nextHref={nextHref}
          sideView={sideView}
          onSideViewChange={setSideView}
        />
      </SidebarInset>
    </SidebarProvider>
  );
}
