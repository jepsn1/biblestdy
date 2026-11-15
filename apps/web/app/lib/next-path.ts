/**
 * Where sign-in sends the reader afterwards (`/signin?next=…`). An expired
 * session mid-read (#26) or a deep link (`/read/ROM/8`, `/notes/<id>`) comes
 * back to the same place. `next` arrives from the URL, so it is untrusted:
 * only a same-origin path is honoured, never another site.
 */

/** The note open beside the text (reader panel), if any — the reader's URL
 * doesn't always carry it, but coming back from sign-in should reopen it. */
let openNote: string | null = null;
export function setOpenNote(id: string | null) {
  openNote = id;
}

/** The page the reader is on: path + query + hash, plus `note=` for a note
 * open in the reader. "/" outside a browser. */
export function currentPath(): string {
  if (typeof window === "undefined") return "/";
  const { pathname, search, hash } = window.location;
  const params = new URLSearchParams(search);
  if (openNote && pathname.startsWith("/read/") && !params.has("note")) {
    params.set("note", openNote);
    return `${pathname}?${params}${hash}`;
  }
  return pathname + search + hash;
}

const BASE = "http://same.invalid";

/** Starts with exactly one "/" and stays on this origin when resolved. */
function isAppPath(path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) return false;
  try {
    return new URL(path, BASE).origin === BASE;
  } catch {
    return false;
  }
}

/** A same-origin app path from untrusted input, else null. Rejects absolute
 * and protocol-relative URLs ("https://x", "//x", "/\\x"), anything not
 * starting with "/", and /signin itself (no loop back to sign-in).
 * Both the input AND the normalised output are checked: dot segments
 * ("/.//x", "/%2e%2e//x") collapse into "//x" — a different host — only
 * after parsing. */
export function safeNext(raw: string | null | undefined): string | null {
  if (!raw || !isAppPath(raw)) return null;
  // Control characters (tab, newline) are stripped by URL parsing — and
  // could smuggle "//" past the check above
  if (/[\u0000-\u001f\u007f]/.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw, BASE);
  } catch {
    return null;
  }
  const out = url.pathname + url.search + url.hash;
  if (!isAppPath(out)) return null;
  if (url.pathname === "/signin" || url.pathname.startsWith("/signin/")) return null;
  return out;
}

/** The sign-in URL that returns to `next` (a bare /signin for "/" or junk). */
export function signinHref(next: string = currentPath()): string {
  const safe = safeNext(next);
  return safe && safe !== "/" ? `/signin?${new URLSearchParams({ next: safe })}` : "/signin";
}

/** The `next` of a sign-in URL's query, sanitised; "/" when absent. */
export function nextFromSearch(search: string): string {
  return safeNext(new URLSearchParams(search).get("next")) ?? "/";
}
