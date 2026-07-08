import { BOOKS, getBook, parseReference } from "@biblestdy/shared";
import { useState } from "react";
import { Link, useNavigate } from "react-router";

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
    <nav className="sticky top-0 z-10 border-b border-stone-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-center gap-2 px-6 py-3">
        <select
          aria-label="Book"
          className="rounded border border-stone-300 bg-white px-2 py-1 text-sm"
          value={book}
          onChange={(e) => navigate(`/read/${e.target.value}/1`)}
        >
          {BOOKS.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>

        <select
          aria-label="Chapter"
          className="rounded border border-stone-300 bg-white px-2 py-1 text-sm"
          value={chapter}
          onChange={(e) => navigate(`/read/${book}/${e.target.value}`)}
        >
          {Array.from({ length: chapterCount }, (_, i) => i + 1).map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <form onSubmit={onJump} className="ml-auto">
          <input
            aria-label="Go to reference"
            placeholder="John 3:16"
            value={jump}
            onChange={(e) => {
              setJump(e.target.value);
              setJumpError(false);
            }}
            className={`w-32 rounded border px-2 py-1 text-sm ${
              jumpError ? "border-red-400" : "border-stone-300"
            }`}
          />
        </form>

        <div className="flex gap-1 text-sm">
          {prev ? (
            <Link className="rounded px-2 py-1 hover:bg-stone-100" to={prev} aria-label="Previous chapter">
              ‹
            </Link>
          ) : (
            <span className="px-2 py-1 text-stone-300">‹</span>
          )}
          {next ? (
            <Link className="rounded px-2 py-1 hover:bg-stone-100" to={next} aria-label="Next chapter">
              ›
            </Link>
          ) : (
            <span className="px-2 py-1 text-stone-300">›</span>
          )}
        </div>
      </div>
    </nav>
  );
}
