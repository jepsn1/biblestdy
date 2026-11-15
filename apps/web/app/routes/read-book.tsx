import { redirect } from "react-router";
import type { Route } from "./+types/read-book";

/** `/read/JHN` → `/read/JHN/1`. An unknown book then gets the reader's own
 * "not a book" message (read.tsx ErrorBoundary). */
export function clientLoader({ params }: Route.ClientLoaderArgs) {
  return redirect(`/read/${params.book}/1`);
}

export default function ReadBook() {
  return null;
}
