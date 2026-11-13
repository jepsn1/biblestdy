import "~/lib/prism-global";
import "~/lib/i18n";

import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import { QueryClientProvider } from "@tanstack/react-query";
import type { Route } from "./+types/root";
import { queryClient } from "~/lib/query";
import { TEXT_SIZE_PREPAINT } from "~/lib/text-size-prepaint";
import { THEME_PREPAINT } from "~/lib/theme-prepaint";
import { watchSystemTheme } from "~/lib/theme";
import { Toaster } from "~/components/ui/sonner";
import { TooltipProvider } from "~/components/ui/tooltip";
import "./app.css";

// Fonts are self-hosted via @fontsource imports in app.css
export const links: Route.LinksFunction = () => [];

export function Layout({ children }: { children: React.ReactNode }) {
  const { i18n } = useTranslation();
  return (
    <html lang={i18n.language} suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        {/* Zoom disabled: the reader is a fixed folio that manages its own scale;
            pinch-zoom fights page-flip + annotation drag gestures. Product
            decision (2026-11-13 UI review): the lock stays — enlarging text
            is the in-app Text size setting instead (#61, WCAG 1.4.4) */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
        />
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
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem("readerStyle")==="clean")document.documentElement.classList.add("style-clean")}catch(e){}`,
          }}
        />
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
  return (
    <QueryClientProvider client={queryClient}>
      {/* Tooltips (#62): ~300ms, then instant while moving between buttons */}
      <TooltipProvider delay={300}>
        <Outlet />
      </TooltipProvider>
      {/* Feedback toasts (#64): bottom centre, clear of the reader's footer
          bar (page arrows) on every screen size */}
      <Toaster
        position="bottom-center"
        offset={{ bottom: "4rem" }}
        mobileOffset={{ bottom: "calc(3.75rem + env(safe-area-inset-bottom))" }}
      />
    </QueryClientProvider>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const { t } = useTranslation();
  let message = t("error.oops");
  let details = t("error.unexpected");
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? (typeof error.data === "string" && error.data) || t("error.notFound")
        : error.statusText || details;
    // Reading quota (#29): the loader already localized the wait message
    if (error.status === 429) {
      message = t("readingLimit.title");
      if (typeof error.data === "string" && error.data) details = error.data;
    }
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
