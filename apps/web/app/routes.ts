import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("read/:book/:chapter", "routes/read.tsx"),
  // A bare book (/read/JHN) opens its first chapter
  route("read/:book", "routes/read-book.tsx"),
  route("notes/:id?", "routes/notes.tsx"),
  // Old topic links land on the Notes page filtered by the topic
  route("topic/:name", "routes/topic.tsx"),
  route("signin", "routes/signin.tsx"),
  // Public — no auth (App Store listing links here)
  route("privacy", "routes/privacy.tsx"),
  // Public — every page showing Bible text links here (API.Bible ToS §7)
  route("copyright", "routes/copyright.tsx"),
  // Anything else: a real "page not found" (not the router's raw error)
  route("*", "routes/not-found.tsx"),
] satisfies RouteConfig;
