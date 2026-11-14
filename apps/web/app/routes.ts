import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("read/:book/:chapter", "routes/read.tsx"),
  route("notes/:id?", "routes/notes.tsx"),
  // Old topic links land on the Notes page filtered by the topic
  route("topic/:name", "routes/topic.tsx"),
  route("signin", "routes/signin.tsx"),
  // Public — no auth (App Store listing links here)
  route("privacy", "routes/privacy.tsx"),
] satisfies RouteConfig;
