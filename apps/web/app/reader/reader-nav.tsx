import { getBook, parseReference } from "@biblestdy/shared";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { SidebarTrigger } from "~/components/ui/sidebar";
import { ThemeToggle } from "~/components/theme-toggle";

export function ReaderNav({ book, chapter }: { book: string; chapter: number }) {
  const navigate = useNavigate();
  const jumpRef = useRef<HTMLInputElement>(null);
  const [jump, setJump] = useState("");
  const [jumpError, setJumpError] = useState(false);

  const current = getBook(book);
  const chapterCount = current?.chapters ?? 1;

  // "/" focuses the jump box from anywhere
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      const typing = target.tagName === "INPUT" || target.tagName === "TEXTAREA";
      if (event.key === "/" && !typing) {
        event.preventDefault();
        jumpRef.current?.focus();
      } else if (event.key === "Escape" && target === jumpRef.current) {
        jumpRef.current?.blur();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
    <nav className="shrink-0 border-b border-border bg-background/85">
      <div className="h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
      <div className="flex items-center gap-2 px-4 py-2">
        <SidebarTrigger aria-label="Toggle books sidebar" />

        <div className="h-4 w-px bg-border" />

        <span className="font-serif text-sm font-medium">{current?.name ?? book}</span>

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

        <ThemeToggle />
      </div>
    </nav>
  );
}
