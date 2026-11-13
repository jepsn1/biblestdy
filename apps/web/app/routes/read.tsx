import type { Chapter, Translation } from "@biblestdy/shared";
import { formatReference } from "@biblestdy/shared";
import { useState } from "react";
import { data, type ShouldRevalidateFunctionArgs, useRevalidator } from "react-router";
import { SidebarInset, SidebarProvider } from "~/components/ui/sidebar";
import i18n from "~/lib/i18n";
import { loadReaderStyle } from "~/lib/reader-style";
import { requireAuth } from "~/lib/require-auth";
import { fetchScripture } from "~/lib/scripture-fetch";
import { BooksSidebar } from "../reader/books-sidebar";
import { adjacentChapter } from "../reader/chapter-nav";
import { PaginatedChapter } from "../reader/paginated-chapter";
import { readingLimitError } from "../reader/reading-limit";
import { ReaderNav } from "../reader/reader-nav";
import { StyleChooser } from "../reader/style-chooser";
import type { Route } from "./+types/read";

let translationsCache: Translation[] | undefined;

async function loadTranslations(): Promise<Translation[]> {
  if (translationsCache) return translationsCache;
  const res = await fetchScripture("/api/translations");
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

/** Page turns rewrite `?p=` (and ?note/?mark come and go) — none of that
 * needs the chapter refetched. A real chapter change or an explicit
 * revalidate (translation switch) still does. */
export function shouldRevalidate({
  currentUrl,
  nextUrl,
  formMethod,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  if (!formMethod && currentUrl.pathname === nextUrl.pathname && currentUrl.search !== nextUrl.search) {
    return false;
  }
  return defaultShouldRevalidate;
}

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const session = await requireAuth();
  // Account reader style (#45) applies before render; null = never chosen
  const [translations, readerStyle] = await Promise.all([
    loadTranslations(),
    loadReaderStyle(session.user.id),
  ]);
  const translation = pickTranslation(translations);
  const res = await fetchScripture(`/api/passages/${translation.id}/${params.book}/${params.chapter}`);
  if (res.status === 404 || res.status === 400) {
    throw data(i18n.t("error.chapterUnavailable"), { status: 404 });
  }
  // Over the reading quota (#29): friendly wait message, no auto-retry
  const limit = await readingLimitError(res, i18n.t);
  if (limit) throw limit;
  if (!res.ok) throw data(i18n.t("error.chapterLoad"), { status: 502 });
  const chapter = (await res.json()) as Chapter;
  // Only a chapter that actually loaded may become the launch page; the
  // reader adds the page (?p) once it knows it (#52)
  const here = `${chapter.book}/${chapter.chapter}`;
  const stored = localStorage.getItem("lastRead");
  if (stored !== here && !stored?.startsWith(`${here}?`)) localStorage.setItem("lastRead", here);
  return { chapter, translation, translations, needsStyleChoice: readerStyle === null };
}

export default function Read({ loaderData }: Route.ComponentProps) {
  const { chapter, translation, translations, needsStyleChoice } = loaderData;
  const [styleChosen, setStyleChosen] = useState(false);
  const revalidator = useRevalidator();
  function switchTranslation(id: string) {
    localStorage.setItem("translationId", id);
    void revalidator.revalidate(); // reloads the chapter in the new version
  }
  const heading = formatReference({ book: chapter.book, chapter: chapter.chapter });
  // Prev/next continue across books (#52): John 21 → Acts 1
  const prevChapter = adjacentChapter(chapter, -1);
  const nextChapter = adjacentChapter(chapter, 1);
  // ONE side slot, content switches: 'connections' | a note id | null.
  // Connections open/closed is the sticky ambient preference; a note borrows
  // the slot and closing it falls back to that preference.
  const [sideView, setSideView] = useState<string | null>(() =>
    typeof localStorage !== "undefined" && localStorage.getItem("connectionsOpen") === "1"
      ? "connections"
      : null,
  );
  // Mobile annotation layer (#15): default OFF — reading shows only
  // highlights/scribbles; the nav toggle reveals the boxes. Not persisted.
  const [annotationBoxesOpen, setAnnotationBoxesOpen] = useState(false);
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
          annotationBoxesOpen={annotationBoxesOpen}
          onToggleAnnotationBoxes={() => setAnnotationBoxesOpen((v) => !v)}
        />
        <PaginatedChapter
          chapter={chapter}
          translation={translation}
          heading={heading}
          prevChapter={prevChapter}
          nextChapter={nextChapter}
          sideView={sideView}
          onSideViewChange={setSideView}
          annotationBoxesOpen={annotationBoxesOpen}
        />
      </SidebarInset>
      {needsStyleChoice && !styleChosen && (
        <StyleChooser verse={chapter.verses[0]} onDone={() => setStyleChosen(true)} />
      )}
    </SidebarProvider>
  );
}
