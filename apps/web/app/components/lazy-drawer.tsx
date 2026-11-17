import { useEffect, useRef, type ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "~/lib/toast";
import { lazyModule, preloadWhenIdle, useLazyModule } from "~/lib/lazy-module";

/**
 * The bottom drawer, code-split (bundle budget, scripts/bundle-budget.mjs):
 * only phones open drawers — the desktop reader never mounts one — so Base
 * UI's drawer (swipe, snap points) stays out of the reader's first load.
 * Same API as `~/components/ui/drawer` (Drawer, DrawerContent, DrawerTitle).
 * A mounted Drawer fetches the chunk once the page is idle; one asked open
 * before it arrives opens the moment it does (a closed drawer renders
 * nothing anyway). The parts render only inside a loaded Drawer.
 */
const drawer = lazyModule(() => import("~/components/ui/drawer"));
type Ui = typeof import("~/components/ui/drawer");

export function Drawer(props: ComponentProps<Ui["Drawer"]>) {
  const { t } = useTranslation();
  useEffect(() => preloadWhenIdle(drawer), []);
  const { value: ui, error, retry } = useLazyModule(drawer, !!props.open);
  // Asked open and the download failed: say so once (a deploy may have
  // renamed the chunk); the next open tries again
  const told = useRef(false);
  useEffect(() => {
    if (!props.open) {
      if (error) retry();
      told.current = false;
      return;
    }
    if (!error || told.current) return;
    told.current = true;
    toast.error(t("common.loadFailed"), {
      action: { label: t("note.reloadPage"), onClick: () => window.location.reload() },
    });
  }, [error, props.open, retry, t]);
  if (!ui) return null;
  return <ui.Drawer {...props} />;
}

/** Rendered only by a loaded Drawer: the module is in. */
const loaded = () => drawer.peek()!;

export function DrawerContent(props: ComponentProps<Ui["DrawerContent"]>) {
  const { DrawerContent } = loaded();
  return <DrawerContent {...props} />;
}

export function DrawerTitle(props: ComponentProps<Ui["DrawerTitle"]>) {
  const { DrawerTitle } = loaded();
  return <DrawerTitle {...props} />;
}
