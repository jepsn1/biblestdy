import { BOOKS } from "@biblestdy/shared";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger } from "~/components/ui/select";
import { useBookName } from "~/lib/book-name";
import { cn } from "~/lib/utils";

const TESTAMENTS = [
  { key: "sidebar.oldTestament", books: BOOKS.slice(0, 39) },
  { key: "sidebar.newTestament", books: BOOKS.slice(39) },
] as const;

/**
 * The address's first part (the top bar reads Book · Chapter · Translation,
 * each its own chooser): the book's name, opening every book in the UI
 * language as a grid, Old and New Testament apart. A listbox like the
 * chapter grid — arrow keys, type-ahead by name ("s" → Salmernes Bog), Esc
 * back. Picking a book opens its first chapter. The sidebar stays the
 * browsing list; this is the same choice where chapter and translation are.
 * Set light (no border, the name in the reading face) so the bar still
 * reads as a title. The name gives way first when the row is short.
 */
export function BookSelect({
  book,
  ref,
  style,
}: {
  book: string;
  /** The row's flexible part (nav-fit measures everything else). */
  ref?: React.Ref<HTMLButtonElement>;
  style?: React.CSSProperties;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const nameOf = useBookName();
  return (
    <Select value={book} onValueChange={(id) => id && navigate(`/read/${id}/1`)}>
      <SelectTrigger
        ref={ref}
        size="sm"
        aria-label={t("nav.book")}
        style={style}
        className="-ml-1 min-w-0 border-transparent pl-1.5 font-serif font-medium hover:bg-muted dark:bg-transparent dark:hover:bg-muted"
      >
        <span className="min-w-0 truncate">{nameOf(book)}</span>
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} align="start" className="w-auto">
        {TESTAMENTS.map(({ key, books }) => (
          <SelectGroup key={key} className="grid grid-cols-2 gap-0.5 sm:grid-cols-3">
            <SelectLabel className="eyebrow col-span-full">{t(key)}</SelectLabel>
            {books.map((b) => (
              <SelectItem
                key={b.id}
                value={b.id}
                indicator={false}
                className={cn(
                  "h-8 w-[9.5rem] justify-start px-2 text-list [&_[data-slot=select-item-text]]:justify-start",
                  "data-selected:font-semibold data-selected:ring-2 data-selected:ring-primary data-selected:ring-inset",
                )}
              >
                {nameOf(b.id)}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
