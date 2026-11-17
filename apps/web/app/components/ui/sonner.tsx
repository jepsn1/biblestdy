import { CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon } from "lucide-react";
import { useEffect } from "react";
import { Toaster as Sonner, toast, type ToasterProps } from "sonner";
import { useIsDark } from "~/lib/theme";
import { sonnerReady } from "~/lib/toast";

/** shadcn Sonner (#64), themed from our own theme store (no next-themes).
 * Loaded via components/lazy-toaster; toast through lib/toast (#228). */
function Toaster(props: ToasterProps) {
  const dark = useIsDark();
  // After Sonner's own effects (children first): it's listening, so the
  // toasts queued before it loaded (lib/toast) replay now
  useEffect(() => sonnerReady({ toast }), []);
  return (
    <Sonner
      theme={dark ? "dark" : "light"}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{ classNames: { toast: "cn-toast" } }}
      {...props}
    />
  );
}

export { Toaster };
