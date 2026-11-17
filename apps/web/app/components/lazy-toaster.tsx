import { useEffect, type ComponentProps } from "react";
import { lazyModule, useLazyModule } from "~/lib/lazy-module";
import { onToastWaiting } from "~/lib/toast";

/**
 * The Toaster, code-split (#228, bundle budget): Sonner downloads right after
 * the first render instead of with it. Toasts asked for meanwhile wait in
 * lib/toast and show once it's mounted; a failed download retries on the
 * next toast. Same props as `~/components/ui/sonner`.
 */
const toaster = lazyModule(() => import("~/components/ui/sonner"));

export function Toaster(props: ComponentProps<typeof import("~/components/ui/sonner").Toaster>) {
  const { value: ui, error, retry } = useLazyModule(toaster);
  useEffect(() => (error ? onToastWaiting(retry) : undefined), [error, retry]);
  if (!ui) return null;
  return <ui.Toaster {...props} />;
}
