import { useEffect, useRef, useState } from "react";
import { Check, Link2, Mail, MessageCircle, Share2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "~/components/ui/popover";
import { apiBase } from "~/lib/api-base";
import { bookLocale } from "~/lib/book-name";
import { shareLinks, shareTarget, type ShareTarget } from "~/lib/share";
import { cn, focusRing } from "~/lib/utils";

/**
 * "Share with a friend" (#182) — a quiet link the reader chooses, never a
 * prompt (lib/support.ts). Where the device has a share sheet
 * (`navigator.share`: phones, some desktops) it opens that — Instagram,
 * Messages and the rest are there. Else a small popover: Copy link, Facebook
 * or Messenger, WhatsApp, Email (a plain list, no menu code on first paint).
 */

/** What this page shares (lib/share.ts), and the device's share sheet. */
export function useShare() {
  const { t, i18n } = useTranslation();
  const { pathname } = useLocation();
  // The app shell's origin is capacitor://localhost — share the site
  const origin = apiBase || (typeof window === "undefined" ? "" : window.location.origin);
  const target = shareTarget(pathname, origin, bookLocale(i18n.language), t);
  // After mount: no share sheet during a prerender
  const [native, setNative] = useState(false);
  useEffect(() => setNative(typeof navigator !== "undefined" && typeof navigator.share === "function"), []);
  return { target, native };
}

/** Opens the share sheet. False: it couldn't (not just dismissed). */
async function nativeShare(target: ShareTarget): Promise<boolean> {
  try {
    await navigator.share({ title: target.title, text: target.text, url: target.url });
    return true;
  } catch (e) {
    return e instanceof DOMException && e.name === "AbortError";
  }
}

async function copyLink(url: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}

/** "Copied", read out (and shown beside Copy link while it lasts). */
function useCopy(url: string) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [said, setSaid] = useState("");
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const copy = async () => {
    const ok = await copyLink(url);
    setCopied(ok);
    // Clear first: the same words twice are read again
    setSaid("");
    window.setTimeout(() => setSaid(ok ? t("share.copiedLive") : t("share.copyFailed")), 50);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 3000);
  };
  const live = (
    <span aria-live="polite" className="sr-only">
      {said}
    </span>
  );
  return { copied, copy, live };
}

const ITEM = cn(
  "flex min-h-11 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-control hover:bg-muted [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground",
  focusRing,
);

/**
 * The share link's trigger, styled by the place it sits in (`className`).
 * Visible `children`; `name` is its full accessible name (contains them).
 */
export function ShareMenu({
  className,
  children,
  name,
  align = "center",
  side = "top",
}: {
  className?: string;
  children: React.ReactNode;
  name?: string;
  align?: "start" | "center" | "end";
  side?: "top" | "bottom";
}) {
  const { t } = useTranslation();
  const { target, native } = useShare();
  const { copied, copy, live } = useCopy(target.url);
  const firstChoice = useRef<HTMLButtonElement>(null);
  const links = shareLinks(target);

  if (native) {
    return (
      <>
        <button
          type="button"
          aria-label={name}
          className={className}
          onClick={() =>
            void nativeShare(target).then((ok) => {
              // No sheet after all (blocked): the link goes on the clipboard
              if (!ok) void copy();
            })
          }
        >
          {children}
        </button>
        {live}
      </>
    );
  }
  return (
    <>
      <Popover>
        <PopoverTrigger render={<button type="button" aria-label={name} className={className} />}>{children}</PopoverTrigger>
        <PopoverContent
          side={side}
          align={align}
          // Its own Esc: the Settings panel it may sit in stays open
          data-share-choices=""
          initialFocus={() => firstChoice.current}
          className="w-auto min-w-56 gap-0 p-1"
        >
          <PopoverTitle className="sr-only">{t("share.menuTitle")}</PopoverTitle>
          <ShareChoices copy={copy} copied={copied} links={links} itemClassName={ITEM} firstRef={firstChoice} />
        </PopoverContent>
      </Popover>
      {live}
    </>
  );
}

/** ↑/↓ between the choices (Tab works too). */
function arrows(e: React.KeyboardEvent<HTMLElement>) {
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
  const list = e.currentTarget.closest("ul");
  if (!list) return;
  const all = [...list.querySelectorAll<HTMLElement>("a, button")];
  const at = all.indexOf(e.currentTarget);
  e.preventDefault();
  all[(at + (e.key === "ArrowDown" ? 1 : all.length - 1)) % all.length]!.focus();
}

/**
 * Copy link, Facebook or Messenger, WhatsApp, Email: real buttons and links
 * (Tab, or the arrow keys, between them). Copy link stays put and says
 * "Copied" where the reader is looking (and reads it out).
 */
function ShareChoices({
  copy,
  copied,
  links,
  itemClassName,
  firstRef,
  id,
}: {
  copy: () => Promise<void>;
  copied: boolean;
  links: ReturnType<typeof shareLinks>;
  itemClassName: string;
  firstRef?: React.Ref<HTMLButtonElement>;
  id?: string;
}) {
  const { t } = useTranslation();
  const choices = [
    [links.facebook, <Share2 key="f" aria-hidden />, t("share.facebook")],
    [links.whatsapp, <MessageCircle key="w" aria-hidden />, t("share.whatsapp")],
    [links.email, <Mail key="e" aria-hidden />, t("share.email")],
  ] as const;
  return (
    <ul
      id={id}
      aria-label={t("share.menuTitle")}
      className="flex flex-col"
    >
      <li>
        <button ref={firstRef} type="button" className={itemClassName} onKeyDown={arrows} onClick={() => void copy()}>
          {copied ? <Check aria-hidden /> : <Link2 aria-hidden />}
          {copied ? t("share.copied") : t("share.copy")}
        </button>
      </li>
      {choices.map(([href, icon, label]) => {
        const mail = href.startsWith("mailto:");
        return (
          <li key={label}>
            <a href={href} className={itemClassName} onKeyDown={arrows} {...(mail ? {} : { target: "_blank", rel: "noopener noreferrer" })}>
              {icon}
              {label}
              {!mail && <span className="sr-only"> {t("copyright.newTab")}</span>}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The More panel's share rows: the share sheet where there is one, else the
 * same choices inline under the row (a disclosure — no menu over a panel).
 */
export function ShareRows({ rowClassName, onShared }: { rowClassName: string; onShared: () => void }) {
  const { t } = useTranslation();
  const { target, native } = useShare();
  const { copied, copy, live } = useCopy(target.url);
  const [open, setOpen] = useState(false);
  const links = shareLinks(target);
  const hint = target.place ? t("share.hintChapter", { place: target.place }) : t("share.hintHome");
  const sub = cn(rowClassName, "min-h-11 py-2 pl-11 text-control");
  return (
    <div>
      <button
        type="button"
        aria-expanded={native ? undefined : open}
        aria-controls={native ? undefined : "more-share-options"}
        className={cn(rowClassName, open && "bg-muted")}
        onClick={() => {
          if (!native) return setOpen((o) => !o);
          void nativeShare(target).then((ok) => (ok ? onShared() : void copy()));
        }}
      >
        <Share2 />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-control font-medium">{t("share.friend")}</span>
          <span className="text-meta text-muted-foreground">{hint}</span>
        </span>
      </button>
      {!native && open && <ShareChoices id="more-share-options" copy={copy} copied={copied} links={links} itemClassName={sub} />}
      {live}
    </div>
  );
}
