import { ExternalLink } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button, buttonVariants } from "~/components/ui/button";
import { GROUP_CHAT_URL, INSTAGRAM_HANDLE, INSTAGRAM_URL } from "~/lib/support";
import { cn } from "~/lib/utils";

/** The two Instagram links (notice + settings). New tab: the reading page stays. */
export function SupportLinks({ onFollow, quiet }: { onFollow?: () => void; quiet?: boolean }) {
  const { t } = useTranslation();
  const link = "h-auto min-h-9 whitespace-normal py-1.5 max-sm:min-h-11";
  return (
    <div className="flex flex-wrap gap-2">
      <a
        href={INSTAGRAM_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onFollow}
        className={cn(buttonVariants(quiet ? { variant: "outline" } : undefined), link)}
      >
        {t("support.follow", { handle: INSTAGRAM_HANDLE })}
        <ExternalLink aria-hidden />
      </a>
      <a
        href={GROUP_CHAT_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onFollow}
        className={cn(buttonVariants({ variant: "outline" }), link)}
      >
        {t("support.chat")}
        <ExternalLink aria-hidden />
      </a>
    </div>
  );
}

/**
 * One-time support notice: a quiet, non-modal card above the reader footer
 * (clear of the page arrows). Doesn't take focus; announced politely.
 * Close, Esc (inside it) or either link dismisses it for the account.
 */
export function SupportNotice({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const titleId = useId();
  const ref = useRef<HTMLElement>(null);
  // Esc closes while focus is inside the card (elsewhere Esc keeps its reader meaning)
  useEffect(() => {
    const el = ref.current;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    el?.addEventListener("keydown", onKey);
    return () => el?.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <section
      ref={ref}
      aria-labelledby={titleId}
      className="fixed inset-x-4 bottom-16 z-40 mx-auto max-w-md animate-in fade-in rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-lg duration-150 xl:inset-x-auto xl:right-4 xl:bottom-20 xl:w-90"
    >
      <div role="status" className="sr-only">
        {t("support.title")}
      </div>
      <div className="flex items-center gap-3">
        <img src="/marcus.webp" alt="" width={40} height={40} className="size-10 shrink-0 rounded-full" />
        <h2 id={titleId} className="min-w-0 flex-1 text-control font-semibold">
          {t("support.title")}
        </h2>
        <Button variant="outline" size="sm" className="shrink-0 max-sm:h-11 max-sm:px-3" onClick={onClose}>
          {t("support.close")}
        </Button>
      </div>
      <p className="mt-2 text-list">{t("support.body")}</p>
      <div className="mt-3">
        <SupportLinks onFollow={onClose} />
      </div>
    </section>
  );
}
