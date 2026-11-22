import { useEffect, useRef } from "react";
import { Link } from "react-router";
import { cn, focusRing } from "~/lib/utils";
import { Logo } from "~/components/logo";

// No @biblestdy/shared here (not even via reader/chapter-nav): root.tsx
// imports this, and root is also evaluated at build/dev time (SPA prerender)

/**
 * The quiet message for a page that can't be shown (not found, offline,
 * an error): type only, centred, always with a way back (`children` are the
 * buttons). The heading takes focus when it appears, so a screen reader
 * hears what happened instead of silence after a navigation.
 */
export function ErrorMessage({
  title,
  message,
  children,
  className,
}: {
  title: string;
  message: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus({ preventScroll: true }), [title]);
  return (
    <div className={cn("flex flex-1 flex-col items-center justify-center px-6 py-12 text-center", className)}>
      <h1 ref={headingRef} tabIndex={-1} className="max-w-md font-serif text-display font-medium text-balance focus:outline-none">
        {title}
      </h1>
      <p className="mt-3 max-w-md font-serif text-reading text-pretty text-muted-foreground">{message}</p>
      {children && <div className="mt-8 flex max-w-full flex-wrap items-center justify-center gap-3">{children}</div>}
    </div>
  );
}

/** A whole page around ErrorMessage, for errors outside the reader: the
 * wordmark (home) on top, as on sign-in, so it still reads as biblestdy. */
export function ErrorScreen(props: React.ComponentProps<typeof ErrorMessage>) {
  return (
    // Safe areas (#251): the wordmark clears the status bar and a notch
    <main className="flex min-h-dvh flex-col bg-background pt-(--safe-top) pr-(--safe-right) pb-(--corner-bottom) pl-(--safe-left)">
      <div className="px-6 pt-6">
        <Link to="/" className={cn("inline-block select-none rounded", focusRing)}>
          <Logo className="text-reading" />
        </Link>
      </div>
      {/* Optically centred: a little above the middle */}
      <ErrorMessage {...props} className={cn("pb-[12vh]", props.className)} />
    </main>
  );
}
