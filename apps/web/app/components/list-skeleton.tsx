import { Skeleton } from "~/components/ui/skeleton";
import { cn } from "~/lib/utils";

/** Loading placeholder for list pages/panels (#64): section title + rows of
 * title/reference lines, the shape of what lands — so nothing jumps. Hidden
 * from screen readers (the heading above is already announced). */
export function ListSkeleton({
  sections = [1, 2, 2],
  className,
}: {
  /** Rows per section. */
  sections?: number[];
  className?: string;
}) {
  return (
    <div aria-hidden className={cn("flex flex-col gap-5", className)} data-testid="list-skeleton">
      {sections.map((rows, i) => (
        <div key={i} className="flex flex-col gap-2 px-2">
          <Skeleton className="h-3 w-24" />
          {Array.from({ length: rows }, (_, r) => (
            <div key={r} className="flex flex-col gap-1.5 py-1">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
