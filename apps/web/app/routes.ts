import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("read/:book/:chapter", "routes/read.tsx"),
  route("signin", "routes/signin.tsx"),
] satisfies RouteConfig;
