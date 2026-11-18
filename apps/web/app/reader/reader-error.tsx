import { getBook } from "@biblestdy/shared";
import { BookOpen, ChevronLeft, ChevronRight, RotateCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useRevalidator } from "react-router";
import { ErrorMessage } from "~/components/error-page";
import { Button, buttonVariants } from "~/components/ui/button";
import { useBookName } from "~/lib/book-name";
import { describeRouteError } from "~/lib/route-error";
import { cn } from "~/lib/utils";
import { PlaceChooser } from "./place-chooser";
import { adjacentChapter, chapterHref, readingHref, type ChapterRef } from "./chapter-nav";

const BUTTON = "h-10 px-4";

/**
 * A chapter that can't be shown (no such book or chapter, not in this
 * translation, offline, over the reading limit, a failed load) says so in
 * place: the nav bar and its address stay, so the reader is never
 * stranded — any book and chapter, Previous/Next or Try again are right there.
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
      // /read/XYZ/1 — the address ("Choose a book") is the way on
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
    <div className="flex h-dvh overflow-hidden">
      <main className="relative flex h-full w-full min-w-0 flex-1 flex-col overflow-hidden bg-background">
        {/* The reader's nav bar, minus what needs a loaded chapter */}
        <nav
          aria-label={t("nav.label")}
          // Safe areas (#251), as the reader's own nav
          className="relative shrink-0 border-b border-border bg-background/85 pt-(--safe-top) pr-(--safe-right) pl-(--safe-left)"
        >
          <div className="h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
          <div className="flex min-h-12 items-center gap-2 px-3 py-2 sm:px-4">
            <PlaceChooser book={book?.id ?? ""} chapter={Number.isInteger(chapter) && chapter > 0 ? chapter : 1} />
          </div>
        </nav>
        <ErrorMessage title={title} message={message} className="pb-[12vh]">
          {actions}
        </ErrorMessage>
      </main>
    </div>
  );
}
