import { useTranslation } from "react-i18next";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Skeleton } from "~/components/ui/skeleton";
import { cn } from "~/lib/utils";

/** Line widths (%) of a ragged text block: looks like prose, never random
 * (stable between renders). */
const WIDTHS = [96, 100, 92, 98, 88, 100, 94, 72, 97, 100, 90, 99, 95, 64];

/**
 * Placeholder lines of text while a chapter is on its way, or while the
 * reader waits out the reading quota (#29). Calm on purpose: a slow pulse,
 * none at all with reduced motion. The lines are decoration (aria-hidden);
 * the polite status says what is happening.
 */
export function SkeletonLines({
  lines,
  limited,
  numeral = false,
  className,
}: {
  lines: number;
  /** Waiting out the reading quota: say so. */
  limited: boolean;
  /** Start with a chapter numeral, like a run-on chapter's opening. */
  numeral?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <div aria-busy="true" data-chapter-skeleton className={cn("flex flex-col gap-[0.65em]", className)}>
      <p role="status" aria-live="polite" className={cn("font-sans text-control text-muted-foreground", !limited && "sr-only")}>
        {limited ? t("reader.slowDown") : t("reader.loadingChapter")}
      </p>
      <div aria-hidden className="flex flex-col gap-[0.65em]">
        {numeral && <Skeleton className="h-[2.2em] w-[1.6em] rounded-sm motion-reduce:animate-none" />}
        {Array.from({ length: lines }, (_, i) => (
          <Skeleton
            key={i}
            className="h-[0.9em] rounded-sm motion-reduce:animate-none [animation-duration:2.4s]"
            style={{ width: `${WIDTHS[i % WIDTHS.length]}%` }}
          />
        ))}
      </div>
    </div>
  );
}

/** The whole sheet as a skeleton: the chapter being opened is waiting out the
 * reading quota (or still on its way). Same box as the reader's sheet; a
 * ScrollArea in case a short window can't hold it. */
export function ChapterSkeleton({ limited }: { limited: boolean }) {
  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="mx-auto w-full max-w-[38rem] px-6 pt-10 pb-16 font-serif text-reading">
        <Skeleton aria-hidden className="mb-8 h-[1.8em] w-[40%] rounded-sm motion-reduce:animate-none" />
        <SkeletonLines lines={WIDTHS.length} limited={limited} />
      </div>
    </ScrollArea>
  );
}
