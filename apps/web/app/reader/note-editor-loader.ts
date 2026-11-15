import { lazyModule } from "~/lib/lazy-module";

/**
 * The note editor chunk (M8). Prism core goes first, in its own step:
 * @lexical/code's prism language components read the global `Prism` as they
 * evaluate, and Rollup's CJS interop can order them before core inside one
 * chunk ("Prism is not defined" — see lib/prism-global.ts). Awaiting the
 * global before the editor chunk evaluates rules that out.
 */
export const noteEditor = lazyModule(() =>
  import("~/lib/prism-global").then(() => import("./note-editor")),
);
