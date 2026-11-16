/** Markdown → plain text, enough for matching and snippets. Its own module:
 * the note list (first paint) uses it, and importing it from the palette's
 * results module pulled all of that into /read's first load. */
export function plainText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_~`>#]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
