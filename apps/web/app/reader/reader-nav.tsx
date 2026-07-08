import { BOOKS, getBook, parseReference } from "@biblestdy/shared";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
  const jumpRef = useRef<HTMLInputElement>(null);
  const [jump, setJump] = useState("");
  const [jumpError, setJumpError] = useState(false);

  const current = getBook(book);
  const chapterCount = current?.chapters ?? 1;
  const prev = chapter > 1 ? `/read/${book}/${chapter - 1}` : null;
  const next = chapter < chapterCount ? `/read/${book}/${chapter + 1}` : null;

  // Techy in behavior too: "/" focuses jump, arrows flip chapters
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      const typing = target.tagName === "INPUT" || target.tagName === "TEXTAREA";
      if (event.key === "/" && !typing) {
        event.preventDefault();
        jumpRef.current?.focus();
      } else if (event.key === "ArrowLeft" && !typing && prev) {
        navigate(prev);
      } else if (event.key === "ArrowRight" && !typing && next) {
        navigate(next);
      } else if (event.key === "Escape" && target === jumpRef.current) {
        jumpRef.current?.blur();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, prev, next]);

  function onJump(event: React.FormEvent) {
    event.preventDefault();
    const ref = parseReference(jump);
    if (!ref) {
      setJumpError(true);
      return;
    }
    setJumpError(false);
    setJump("");
    jumpRef.current?.blur();
    navigate(`/read/${ref.book}/${ref.chapter ?? 1}`);
  }

  return (
    <nav className="sticky top-0 z-10 border-b border-border bg-background/85 backdrop-blur">
      {/* hairline gold accent */}
      <div className="h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
      <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-2">
        <Link to="/" className="mr-1 flex select-none items-baseline gap-1.5" aria-label="Home">
          <span className="font-mono text-sm font-semibold tracking-tight text-primary">
            biblestdy
          </span>
          <span className="hidden font-mono text-[0.6rem] text-muted-foreground sm:block">
            v0
          </span>
        </Link>

        <div className="h-4 w-px bg-border" />

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
          <SelectTrigger aria-label="Chapter" size="sm" className="font-mono">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: chapterCount }, (_, i) => i + 1).map((c) => (
              <SelectItem key={c} value={String(c)} className="font-mono">
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <form onSubmit={onJump} className="relative ml-auto">
          <Input
            ref={jumpRef}
            aria-label="Go to reference"
            placeholder="Go to reference…"
            value={jump}
            onChange={(e) => {
              setJump(e.target.value);
              setJumpError(false);
            }}
            aria-invalid={jumpError || undefined}
            className="h-7 w-44 pr-8 font-mono text-xs placeholder:font-sans"
          />
          <kbd className="pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2 rounded border border-border bg-muted px-1 font-mono text-[0.6rem] text-muted-foreground">
            /
          </kbd>
        </form>

        <div className="flex items-center gap-0.5">
          <NavArrow to={prev} label="Previous chapter">
            <ChevronLeft className="size-3.5" />
          </NavArrow>
          <NavArrow to={next} label="Next chapter">
            <ChevronRight className="size-3.5" />
          </NavArrow>
        </div>
      </div>
    </nav>
  );
}

function NavArrow({
  to,
  label,
  children,
}: {
  to: string | null;
  label: string;
  children: React.ReactNode;
}) {
  if (!to) {
    return (
      <span className="flex size-7 items-center justify-center rounded-md border border-border text-muted-foreground/30">
        {children}
      </span>
    );
  }
  return (
    <Link
      to={to}
      aria-label={label}
      className="flex size-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
    >
      {children}
    </Link>
  );
}
