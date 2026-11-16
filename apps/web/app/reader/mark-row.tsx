import type { BookLocale } from "@biblestdy/shared";
import { chipLabel } from "~/lib/reference-label";
import { cn } from "~/lib/utils";
import type { PageMark } from "../notes/page-marks";
import { HIGHLIGHT_SWATCH, NOTE_INK } from "./highlight-colors";

/**
 * One page mark as a suggestion row (#191): how it's marked (a swatch or
 * the pen's stroke, beside its name in words), the chip it becomes, the
 * marked words. The `@` menu's option and the "+ Verse" dialog's button.
 */
export function MarkRow({ mark, locale, kind, active = false }: { mark: PageMark; locale: BookLocale; kind: string; active?: boolean }) {
  const first = mark.kinds[0];
  // On the active row's tint the muted grey falls short of 4.5:1
  const muted = active ? "text-accent-foreground" : "text-muted-foreground";
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
      <span className="flex min-w-0 items-center gap-2">
        {first.type === "highlight" ? (
          <span aria-hidden className="size-3 shrink-0 rounded-full ring-1 ring-foreground/20" style={{ background: HIGHLIGHT_SWATCH[first.color] }} />
        ) : (
          <svg aria-hidden viewBox="0 0 12 12" className="size-3 shrink-0" fill="none" stroke={NOTE_INK} strokeWidth="1.6" strokeLinecap="round">
            {first.mark === "underline" ? <path d="M1 9.5 Q6 8.5 11 9.5" /> : first.mark === "bracket" ? <path d="M8 1.5 H5 V10.5 H8" /> : first.mark === "contour" ? <rect x="1.5" y="2.5" width="9" height="7" rx="1.5" /> : <ellipse cx="6" cy="6" rx="4.8" ry="3.8" />}
          </svg>
        )}
        <span className="font-sans font-medium whitespace-nowrap">{chipLabel(mark.ref, locale)}</span>
        <span className={cn("min-w-0 truncate font-sans text-meta", muted)}>{kind}</span>
      </span>
      {mark.snippet && <span className={cn("min-w-0 truncate pl-5 font-serif text-list", muted)}>{mark.snippet}</span>}
    </span>
  );
}
