import { lazyModule } from "~/lib/lazy-module";

/**
 * The Compare translations dialog, its own chunk (#167): it carries the
 * versification map, which the reader's first load never needs. Preloaded
 * when a selection, highlight or mark menu opens (the item is there).
 */
export const compareDialog = lazyModule(() => import("./compare-dialog"));

/**
 * What the dialog borrows from the reader's first paint, handed over at
 * render (props), not imported: a static import from the lazy chunk makes
 * the bundler split these out of the reader's chunk into small shared
 * chunks that gzip worse (/read budget). Types only here.
 */
export type CompareKit = {
  chapterQuery: typeof import("./chapter-cache").chapterQuery;
  retryWhenLimited: typeof import("./chapter-cache").retryWhenLimited;
  notifyCopyFailed: typeof import("~/lib/notify").notifyCopyFailed;
  notifyCopyLimit: typeof import("~/lib/notify").notifyCopyLimit;
  passageLines: typeof import("./chapter-layout").passageLines;
  groupTranslations: typeof import("./translation-chooser").groupTranslations;
  translationTitle: typeof import("./translation-chooser").translationTitle;
  formatWait: typeof import("./reading-limit").formatWait;
  referenceLabel: typeof import("~/lib/reference-label").referenceLabel;
  useFumsView: typeof import("~/lib/fums").useFumsView;
  useTextSize: typeof import("~/lib/text-size").useTextSize;
  showVerses: typeof import("~/lib/print-limit").showVerses;
  Drawer: typeof import("~/components/lazy-drawer").Drawer;
  DrawerContent: typeof import("~/components/lazy-drawer").DrawerContent;
  DrawerTitle: typeof import("~/components/lazy-drawer").DrawerTitle;
};
