import { ExternalLink, X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button, buttonVariants } from "~/components/ui/button";
import { GROUP_CHAT_URL, INSTAGRAM_HANDLE, INSTAGRAM_URL } from "~/lib/support";
import { cn } from "~/lib/utils";

/** The two Instagram links (notice + settings). New tab: the reading page stays. */
export function SupportLinks({ onFollow, stacked }: { onFollow?: () => void; stacked?: boolean }) {
  const { t } = useTranslation();
  const link = "h-auto min-h-10 whitespace-normal py-2 max-sm:min-h-12";
  return (
    <div className={cn("flex gap-2", stacked ? "flex-col" : "flex-wrap")}>
      <a
        href={INSTAGRAM_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onFollow}
        className={cn(buttonVariants(), link)}
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
      className="fixed inset-x-4 bottom-16 z-40 mx-auto max-w-md animate-in fade-in rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-lg duration-150 pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <div role="status" className="sr-only">
        {t("support.title")}
      </div>
      <div className="flex items-start gap-3">
        <img src="/marcus.webp" alt="" width={48} height={48} className="size-12 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="text-control font-semibold">
            {t("support.title")}
          </h2>
          <p className="mt-1 text-control">{t("support.body")}</p>
        </div>
        <Button variant="ghost" size="icon" className="-mt-1 -mr-1 max-sm:size-11" aria-label={t("support.close")} onClick={onClose}>
          <X />
        </Button>
      </div>
      <div className="mt-3">
        <SupportLinks stacked onFollow={onClose} />
        <p className="mt-2 text-meta text-muted-foreground">{t("support.chatHint")}</p>
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <p className="text-meta text-muted-foreground">{t("support.footnote")}</p>
        <Button variant="ghost" className="shrink-0 max-sm:h-11" onClick={onClose}>
          {t("support.close")}
        </Button>
      </div>
    </section>
  );
}
