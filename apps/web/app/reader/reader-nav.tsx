import { BOOKS, getBook, parseReference } from "@biblestdy/shared";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

export function ReaderNav({ book, chapter }: { book: string; chapter: number }) {
  const navigate = useNavigate();
  const [jump, setJump] = useState("");
  const [jumpError, setJumpError] = useState(false);

  const current = getBook(book);
  const chapterCount = current?.chapters ?? 1;
  const prev = chapter > 1 ? `/read/${book}/${chapter - 1}` : null;
  const next = chapter < chapterCount ? `/read/${book}/${chapter + 1}` : null;

  function onJump(event: React.FormEvent) {
    event.preventDefault();
    const ref = parseReference(jump);
    if (!ref) {
      setJumpError(true);
      return;
    }
    setJumpError(false);
    setJump("");
    navigate(`/read/${ref.book}/${ref.chapter ?? 1}`);
  }

  return (
    <nav className="sticky top-0 z-10 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-center gap-2 px-6 py-2.5">
        <span className="mr-1 hidden font-serif text-sm font-semibold tracking-wide text-primary sm:block">
          biblestdy
        </span>

        <Select
          value={book}
          onValueChange={(value) => navigate(`/read/${String(value)}/1`)}
          items={BOOKS.map((b) => ({ value: b.id, label: b.name }))}
        >
          <SelectTrigger aria-label="Book" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BOOKS.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={String(chapter)}
          onValueChange={(value) => navigate(`/read/${book}/${String(value)}`)}
        >
          <SelectTrigger aria-label="Chapter" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: chapterCount }, (_, i) => i + 1).map((c) => (
              <SelectItem key={c} value={String(c)}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <form onSubmit={onJump} className="ml-auto">
          <Input
            aria-label="Go to reference"
            placeholder="John 3:16"
            value={jump}
            onChange={(e) => {
              setJump(e.target.value);
              setJumpError(false);
            }}
            aria-invalid={jumpError || undefined}
            className="h-7 w-32 text-sm"
          />
        </form>

        <div className="flex gap-0.5 text-sm">
          {prev ? (
            <Link
              className="rounded-md px-2 py-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              to={prev}
              aria-label="Previous chapter"
            >
              ‹
            </Link>
          ) : (
            <span className="px-2 py-1 text-muted-foreground/40">‹</span>
          )}
          {next ? (
            <Link
              className="rounded-md px-2 py-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              to={next}
              aria-label="Next chapter"
            >
              ›
            </Link>
          ) : (
            <span className="px-2 py-1 text-muted-foreground/40">›</span>
          )}
        </div>
      </div>
    </nav>
  );
}
