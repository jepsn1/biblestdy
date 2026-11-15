import { getBook } from "@biblestdy/shared";
import { useNavigate } from "react-router";
import { Select, SelectContent, SelectItem } from "~/components/ui/select";

/**
 * Every chapter of the book as a number grid (#62): Psalms' 150 chapters in
 * a few rows, not a 150-row list; anchored below its trigger like every
 * menu. A listbox (arrow keys, Enter, Esc back to the trigger) — picking a
 * number opens that chapter. `children` is the trigger: the top bar's
 * dropdown, or the chapter strip's "All chapters".
 */
export function ChapterSelect({
  book,
  chapter,
  children,
}: {
  book: string;
  chapter: number;
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  const count = getBook(book)?.chapters ?? 1;
  return (
    <Select value={String(chapter)} onValueChange={(value) => navigate(`/read/${book}/${String(value)}`)}>
      {children}
      <SelectContent
        alignItemWithTrigger={false}
        align="start"
        className="w-auto"
        listClassName="grid grid-cols-[repeat(6,2.5rem)] gap-0.5 p-1"
      >
        {Array.from({ length: count }, (_, i) => i + 1).map((c) => (
          <SelectItem
            key={c}
            value={String(c)}
            indicator={false}
            className="h-9 justify-center px-0 font-mono tabular-nums data-selected:font-semibold data-selected:ring-2 data-selected:ring-primary data-selected:ring-inset"
          >
            {c}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
