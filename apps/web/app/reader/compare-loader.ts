import { lazyModule } from "~/lib/lazy-module";

/**
 * The Compare translations dialog, its own chunk (#167): it carries the
 * versification map, which the reader's first load never needs. Preloaded
 * when a selection, highlight or mark menu opens (the item is there).
 */
export const compareDialog = lazyModule(() => import("./compare-dialog"));
