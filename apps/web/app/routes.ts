import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("read/:book/:chapter", "routes/read.tsx"),
  route("topic/:name", "routes/topic.tsx"),
  route("signin", "routes/signin.tsx"),
  // Public — no auth (App Store listing links here)
  route("privacy", "routes/privacy.tsx"),
] satisfies RouteConfig;
