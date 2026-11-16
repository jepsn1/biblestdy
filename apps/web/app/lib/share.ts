import { bookName, getBook, type BookLocale } from "@biblestdy/shared";

/**
 * "Share with a friend" (#182): what a share sends — the chapter being read
 * (its reference + a link to it), else the front page. Only ever a quiet
 * link the reader chooses (never a prompt: API.Bible non-commercial terms,
 * lib/support.ts), and never Bible text (licensing) — just the reference, the
 * link and a short line.
 *
 * A signed-out friend following a chapter link is sent to sign-in with
 * `next` (require-auth.ts) and lands on that chapter once signed in.
 */
export type ShareTarget = {
  /** "John 3"; null: the front page. */
  place: string | null;
  /** "John 3 on biblestdy" / "biblestdy". */
  title: string;
  /** The short line: "Read John 3 with me on biblestdy." */
  text: string;
  url: string;
};

type T = (key: string, options?: Record<string, unknown>) => string;

/** The chapter a reader path is on ("/read/JHN/3?p=2" → JHN 3), else null. */
export function chapterOfPath(pathname: string): { book: string; chapter: number } | null {
  const m = /^\/read\/([A-Z0-9]{3})\/(\d+)\/?$/.exec(pathname);
  if (!m) return null;
  const book = getBook(m[1]!);
  const chapter = Number(m[2]);
  if (!book || chapter < 1 || chapter > book.chapters) return null;
  return { book: book.id, chapter };
}

export function shareTarget(pathname: string, origin: string, locale: BookLocale, t: T): ShareTarget {
  const here = chapterOfPath(pathname);
  if (!here) return { place: null, title: "biblestdy", text: t("share.messageHome"), url: `${origin}/` };
  const place = `${bookName(here.book, locale)} ${here.chapter}`;
  return {
    place,
    title: t("share.title", { place }),
    text: t("share.message", { place }),
    // The chapter only: no page, verse or open note
    url: `${origin}/read/${here.book}/${here.chapter}`,
  };
}

/** Where the share menu's links go (no native share sheet). Instagram has no
 * web share URL — it is reached through the native sheet only. */
export function shareLinks(target: ShareTarget) {
  const line = `${target.text} ${target.url}`;
  return {
    facebook: `https://www.facebook.com/sharer/sharer.php?${new URLSearchParams({ u: target.url })}`,
    whatsapp: `https://wa.me/?${new URLSearchParams({ text: line })}`,
    email: `mailto:?subject=${encodeURIComponent(target.title)}&body=${encodeURIComponent(`${target.text}\n\n${target.url}`)}`,
  };
}
