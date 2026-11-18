import { cn } from "~/lib/utils";

// The logo (#250, panel 2026-11-18): a lowercase-b monogram whose bowl drops a
// notched ribbon marker ("your place is kept"), set beside the Geist Mono
// wordmark. currentColor, so Paper gold / Clean ink and light/dark come free.
// Sized in em: it scales with the text (200 %, large text). The tab and
// home-screen icons are drawn from the same shape (public/, tools/brand).
// No @biblestdy/shared here: root/error-page import this (SPA prerender).

/** The mark alone. Decorative: the link around it is named by the wordmark. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1.2em"
      height="1.2em"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      // The bowl's base (y 18.6) sits on the text baseline; the ribbon hangs below
      className={cn("inline-block shrink-0 align-[-0.27em]", className)}
    >
      <path d="M7 3.2V18.6" />
      <path d="M7 12.4C7 9.8 9.1 8 11.9 8 15 8 17.2 10.3 17.2 13.3 17.2 16.3 15 18.6 11.9 18.6H7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11 18.6H14V23L12.5 21 11 23Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Mark + wordmark. The text "biblestdy" is the accessible name of a link
 * around it. Font size comes from the caller (text-control, text-reading…). */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-block font-mono font-semibold tracking-tight whitespace-nowrap text-primary", className)}>
      {/* A clear gap, wider than a mono space, so it never reads "b biblestdy" */}
      <LogoMark className="mr-[0.55em]" />
      biblestdy
    </span>
  );
}
