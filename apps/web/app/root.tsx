import "~/lib/i18n";

import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { BookOpen, RotateCw } from "lucide-react";
import {
  Link,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRevalidator,
} from "react-router";

import { QueryClientProvider } from "@tanstack/react-query";
import type { Route } from "./+types/root";
import { queryClient } from "~/lib/query";
import { TEXT_SIZE_PREPAINT } from "~/lib/text-size-prepaint";
import { THEME_PREPAINT } from "~/lib/theme-prepaint";
import { watchSystemTheme } from "~/lib/theme";
import { describeRouteError } from "~/lib/route-error";
import { cn } from "~/lib/utils";
import { ErrorScreen } from "~/components/error-page";
import { Button, buttonVariants } from "~/components/ui/button";
import { useViewportZoom, VIEWPORT_OPEN, VIEWPORT_PREPAINT } from "~/lib/viewport";
import { usePrintLimit } from "~/lib/print-limit";
import { Toaster } from "~/components/ui/sonner";
import { TooltipProvider } from "~/components/ui/tooltip";
import "./app.css";

/** Reader style pre-paint (#45): Clean = .style-clean; Paper = none. */
const READER_STYLE_PREPAINT = `try{if(localStorage.getItem("readerStyle")==="clean")document.documentElement.classList.add("style-clean")}catch(e){}`;

// Fonts are self-hosted via @fontsource imports in app.css
export const links: Route.LinksFunction = () => [];

export function Layout({ children }: { children: React.ReactNode }) {
  const { i18n } = useTranslation();
  return (
    <html lang={i18n.language} suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        {/* Zoom on by default (public pages are websites — M10); app routes
            (reader, notes) and the native shell lock it — see lib/viewport */}
        <meta name="viewport" content={VIEWPORT_OPEN} />
        <script dangerouslySetInnerHTML={{ __html: VIEWPORT_PREPAINT }} />
        <meta name="theme-color" content="#211d18" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.webmanifest" />
        {/* Install-only service worker (#13, no offline) — prod build ships /sw.js */}
        {import.meta.env.PROD && (
          <script
            dangerouslySetInnerHTML={{
              __html: `if("serviceWorker" in navigator)addEventListener("load",()=>navigator.serviceWorker.register("/sw.js",{scope:"/"}))`,
            }}
          />
        )}
        {/* Apply stored theme before first paint (light Paper is the
            default; "system" follows the OS — #62) */}
        <script dangerouslySetInnerHTML={{ __html: THEME_PREPAINT }} />
        {/* Same for the reader style (#45, Clean = .style-clean; Paper = none).
            Key/class mirror lib/reader-style.ts (not imported: root is SSR'd) */}
        <script dangerouslySetInnerHTML={{ __html: READER_STYLE_PREPAINT }} />
        {/* And the text size (#61): root font-size, so text + chrome scale */}
        <script dangerouslySetInnerHTML={{ __html: TEXT_SIZE_PREPAINT }} />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  useEffect(() => watchSystemTheme(), []);
  useViewportZoom();
  usePrintLimit();
  const { t } = useTranslation();
  return (
    <QueryClientProvider client={queryClient}>
      {/* Printed only, in place of more than 100 verses (lib/print-limit) */}
      <p className="print-limit-note">{t("print.limited")}</p>
      {/* Tooltips (#62): ~300ms, then instant while moving between buttons */}
      <TooltipProvider delay={300}>
        <Outlet />
      </TooltipProvider>
      {/* Feedback toasts (#64): bottom centre, clear of the reader's footer
          page bar on every screen size */}
      <Toaster
        position="bottom-center"
        offset={{ bottom: "5rem" }}
        mobileOffset={{ bottom: "calc(5rem + env(safe-area-inset-bottom))" }}
      />
    </QueryClientProvider>
  );
}

/** Last resort for an error no route handled (the reader has its own,
 * inside its shell): a quiet localized page with Try again and a way back —
 * never the router's raw text. Dev builds still show the stack. */
export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const { t } = useTranslation();
  // Public pages zoom, app routes stay locked (#128) — on the error page too
  useViewportZoom();
  const revalidator = useRevalidator();
  const online = typeof navigator === "undefined" || navigator.onLine;
  const { kind, detail } = describeRouteError(error, online);
  const stack = import.meta.env.DEV && error instanceof Error ? error.stack : undefined;
  // An error in the first render makes React rebuild <html>, dropping what
  // the pre-paint scripts set (dark theme, reader style, text size): rerun
  // them, so the page doesn't flash to light/100% for a dark-mode reader
  useEffect(() => {
    for (const code of [THEME_PREPAINT, READER_STYLE_PREPAINT, TEXT_SIZE_PREPAINT]) {
      const script = document.createElement("script");
      script.textContent = code;
      document.head.append(script);
      script.remove();
    }
  }, []);

  // "Back to reading" is "/": it reopens the page last read (home.tsx).
  // chapter-nav's readingHref would pull @biblestdy/shared into root, which
  // is also evaluated at build (SPA prerender) where that import fails.
  if (kind === "notFound") {
    return (
      <ErrorScreen title={t("error.notFoundTitle")} message={detail ?? t("error.notFoundBody")}>
        <Link to="/" className={cn(buttonVariants({ size: "lg" }), "h-10 px-4")}>
          <BookOpen aria-hidden />
          {t("error.backToReading")}
        </Link>
      </ErrorScreen>
    );
  }

  const title =
    kind === "offline" ? t("error.offlineTitle") : kind === "limit" ? t("readingLimit.title") : t("error.title");
  const message = kind === "offline" ? t("error.offlineBody") : (detail ?? t("error.unexpected"));
  // Offline, a reload would trade this page for the browser's own error;
  // re-running the loaders keeps it and recovers once the network is back
  const retry = () => (navigator.onLine ? window.location.reload() : void revalidator.revalidate());
  return (
    <ErrorScreen title={title} message={message}>
      <Button size="lg" className="h-10 px-4" onClick={retry}>
        <RotateCw aria-hidden className={cn(revalidator.state === "loading" && "animate-spin")} />
        {t("error.tryAgain")}
      </Button>
      <Link to="/" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-10 px-4")}>
        <BookOpen aria-hidden />
        {t("error.backToReading")}
      </Link>
      {stack && (
        <pre className="mt-6 max-w-3xl min-w-0 basis-full overflow-x-auto rounded-md bg-muted p-4 text-left text-meta">
          <code>{stack}</code>
        </pre>
      )}
    </ErrorScreen>
  );
}
