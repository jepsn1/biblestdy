import { redirect } from "react-router";
import type { Route } from "./+types/topic";

/** The topic page became a filter on the Notes page (notes plan, Phase 1):
 * old links and bookmarks still land on the topic. */
export function clientLoader({ params }: Route.ClientLoaderArgs) {
  return redirect(`/notes?topic=${encodeURIComponent(params.name)}`);
}

export default function TopicRedirect() {
  return null;
}
