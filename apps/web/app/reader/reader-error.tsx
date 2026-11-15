import { getBook } from "@biblestdy/shared";
import { BookOpen, ChevronLeft, ChevronRight, RotateCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useRevalidator } from "react-router";
import { ErrorMessage } from "~/components/error-page";
import { Hint } from "~/components/hint";
import { Button, buttonVariants } from "~/components/ui/button";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "~/components/ui/sidebar";
import { useBookName } from "~/lib/book-name";
import { describeRouteError } from "~/lib/route-error";
import { cn } from "~/lib/utils";
import { BooksSidebar } from "./books-sidebar";
import { adjacentChapter, chapterHref, readingHref, type ChapterRef } from "./chapter-nav";

const BUTTON = "h-10 px-4";

/**
 * A chapter that can't be shown (no such book or chapter, not in this
 * translation, offline, over the reading limit, a failed load) says so in
 * place: the books sidebar and the nav bar stay, so the reader is never
 * stranded — the book list, Previous/Next or Try again are right there.
 */
export function ReaderError({ error, params }: { error: unknown; params: { book: string; chapter: string } }) {
  const { t } = useTranslation();
  const nameOf = useBookName();
  const revalidator = useRevalidator();
  const { pathname } = useLocation();
  const book = getBook(params.book.toUpperCase());
  const chapter = Number(params.chapter);
  const online = typeof navigator === "undefined" || navigator.onLine;
  const { kind, detail } = describeRouteError(error, online);
  const label = (ref: ChapterRef) => `${nameOf(ref.book)} ${ref.chapter}`;

  let title: string;
  let message: string;
  let actions: React.ReactNode;
  // Never back to the page that just failed (offline or over the limit on
  // the last chapter read): that button would do nothing. "/" is no way out
  // either — it reopens lastRead — so then Try again stands alone.
  const back = readingHref();
  const backToReading = back.split("?")[0].toUpperCase() !== pathname.toUpperCase() && (
    <Link to={back} className={cn(buttonVariants({ variant: "outline", size: "lg" }), BUTTON)}>
      <BookOpen aria-hidden />
      {t("error.backToReading")}
    </Link>
  );

  if (kind === "notFound") {
    title = t("error.chapterNotFound");
    if (!book) {
      // /read/XYZ/1 — the books sidebar is the way on
      message = t("error.noSuchBook", { book: params.book });
      actions = backToReading;
    } else if (!Number.isInteger(chapter) || chapter < 1 || chapter > book.chapters) {
      // /read/JHN/99 — say how many there are; offer the nearest real one
      message = t("error.chapterCount", { book: nameOf(book.id), count: book.chapters });
      const nearest = { book: book.id, chapter: chapter > book.chapters ? book.chapters : 1 };
      actions = (
        <>
          <Link to={chapterHref(nearest)} className={cn(buttonVariants({ size: "lg" }), BUTTON)}>
            {label(nearest)}
          </Link>
          {backToReading}
        </>
      );
    } else {
      // A real chapter this translation doesn't have: read on either side
      message = detail ?? t("error.chapterUnavailable");
      const prev = adjacentChapter({ book: book.id, chapter }, -1);
      const next = adjacentChapter({ book: book.id, chapter }, 1);
      actions = (
        <>
          {prev && (
            <Link
              to={chapterHref(prev)}
              aria-label={t("reader.prevChapterTo", { ref: label(prev) })}
              className={cn(buttonVariants({ variant: "outline", size: "lg" }), BUTTON)}
            >
              <ChevronLeft aria-hidden />
              {label(prev)}
            </Link>
          )}
          {next && (
            <Link
              to={chapterHref(next)}
              aria-label={t("reader.nextChapterTo", { ref: label(next) })}
              className={cn(buttonVariants({ variant: "outline", size: "lg" }), BUTTON)}
            >
              {label(next)}
              <ChevronRight aria-hidden />
            </Link>
          )}
        </>
      );
    }
  } else {
    // Offline, the reading limit (#29 wrote the wait), or a failed load:
    // the chapter itself is fine — Try again re-runs the loader in place
    title =
      kind === "offline" ? t("error.offlineTitle") : kind === "limit" ? t("readingLimit.title") : t("error.title");
    message = kind === "offline" ? t("error.offlineBody") : (detail ?? t("error.unexpected"));
    actions = (
      <>
        <Button
          size="lg"
          className={BUTTON}
          onClick={() => void revalidator.revalidate()}
        >
          {/* Not disabled while it runs: that would drop keyboard focus */}
          <RotateCw aria-hidden className={cn(revalidator.state === "loading" && "animate-spin")} />
          {t("error.tryAgain")}
        </Button>
        {backToReading}
      </>
    );
  }

  return (
    <SidebarProvider className="h-dvh overflow-hidden">
      <BooksSidebar book={book?.id ?? ""} />
      <SidebarInset className="flex h-full min-w-0 flex-col overflow-hidden">
        {/* The reader's nav bar, minus what needs a loaded chapter */}
        <nav aria-label={t("nav.label")} className="relative shrink-0 border-b border-border bg-background/85">
          <div className="h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
          <div className="flex min-h-12 items-center gap-2 px-3 py-2 sm:px-4">
            <Hint label={t("nav.toggleSidebar")} shortcut="mod+B">
              <SidebarTrigger aria-label={t("nav.toggleSidebar")} />
            </Hint>
            {book && (
              <>
                <div className="h-4 w-px bg-border" />
                <span className="min-w-0 truncate font-serif text-control font-medium">{nameOf(book.id)}</span>
              </>
            )}
          </div>
        </nav>
        <ErrorMessage title={title} message={message} className="pb-[12vh]">
          {actions}
        </ErrorMessage>
      </SidebarInset>
    </SidebarProvider>
  );
}
