import type { Translation } from "@biblestdy/shared";
import { useTranslation } from "react-i18next";
import { MonitorDown, NotebookText, Share, SquarePlus } from "lucide-react";
import { Link } from "react-router";
import { Hint } from "~/components/hint";
import { Button } from "~/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { usePwaInstall } from "~/hooks/use-pwa-install";
import { cn, focusRing } from "~/lib/utils";
import { AccountChip } from "./account-settings";
import { PANEL_TOGGLE } from "./connections-panel";
import { MoreSheet } from "./more-sheet";
import { PaletteTrigger } from "../palette/palette-trigger";
import { schemeOf } from "./chapter-nav";
import { PlaceChooser } from "./place-chooser";
import { TranslationChooser } from "./translation-chooser";

export function ReaderNav({
  book,
  chapter,
  translations,
  translationId,
  onSwitchTranslation,
  connectionsOpen,
  onToggleConnections,
  annotationBoxesOpen,
  onToggleAnnotationBoxes,
  chapterInStrip = false,
  chapterTo = null,
  scrollMode = false,
}: {
  book: string;
  chapter: number;
  translations: Translation[];
  translationId: string;
  onSwitchTranslation: (id: string) => void;
  connectionsOpen: boolean;
  onToggleConnections: () => void;
  annotationBoxesOpen: boolean;
  onToggleAnnotationBoxes: () => void;
  /** The sheet's chapter strip shows (desktop, paged): the address opens on the books. */
  chapterInStrip?: boolean;
  /** The spread runs on to this chapter (#146). */
  chapterTo?: number | null;
  /** The text scrolls (phones, very large text): More offers margin notes. */
  scrollMode?: boolean;
}) {
  const { t } = useTranslation();
  const pwa = usePwaInstall();

  return (
    <nav
      aria-label={t("nav.label")}
      className="relative shrink-0 border-b border-border bg-background/85"
    >
      <div className="h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
      {/* One row (a second row costs reading height on every phone page).
          One shed order, decided by CSS on the row's own width in rem — a
          container, so text size and window count alike, nothing measured
          (#144): the wordmark goes (< 56rem), the search field becomes a
          worded "Search" (< 48rem), Notes + Settings move into a worded
          More (< 36rem; phones always), the translation drops its chevron
          (< 28rem). The book name gives way first throughout (ellipsis),
          down to a recognisable 5em; only a row too narrow for even that
          (a phone at 200 %) wraps, as the last resort — never an icon alone. */}
      <div className="@container/nav flex flex-wrap items-center gap-1 px-3 py-2 sm:gap-2 sm:px-4">
        {/* The wordmark (the sidebar's, before it went): whose site this is,
            and home. Only where the row has room (rem: large text hides it first) */}
        <Link
          to="/"
          aria-label={t("nav.home")}
          className={cn("mr-1 hidden shrink-0 rounded-md select-none @4xl/nav:inline", focusRing)}
        >
          <span className="font-mono text-control font-semibold tracking-tight text-primary">biblestdy</span>
        </Link>

        {/* The address — "Salmerne 23 ⌄" — and the one pointer route to any
            book and chapter (persona panel 2026-11-15). The name gives way
            first when the row is short; the chapter number never. */}
        <PlaceChooser
          book={book}
          chapter={chapter}
          chapterTo={chapterTo}
          stripShown={chapterInStrip}
          scheme={schemeOf(translations.find((tr) => tr.id === translationId)?.abbreviation)}
        />

        {/* The edition, part of the citation ("Salmerne 23 · BPH"): right
            after the address, quieter than it, a clear gap between (#11) */}
        {translations.length > 1 && (
          <TranslationChooser
            translations={translations}
            translationId={translationId}
            onSwitch={onSwitchTranslation}
          />
        )}

        {/* Search or go to (#53): the worded field where the row has room,
            a worded "Search" button where it hasn't — never an icon alone */}
        <PaletteTrigger />

        {/* Notes on this chapter, beside the text (#62): always worded
            (Birthe: no lone icons). The notes PAGE is "All notes" — never
            just "Notes". Phones reach it through the labelled More sheet. */}
        <Hint label={t("nav.connectionsLabel")} shortcut="mod+.">
          <Button
            variant={connectionsOpen ? "secondary" : "ghost"}
            size="sm"
            // Into More below 36rem (MORE_BELOW_REM) and on phones
            className="hidden shrink-0 gap-1.5 px-2.5 sm:@min-[36rem]/nav:inline-flex"
            aria-label={t("nav.connectionsLabel")}
            aria-pressed={connectionsOpen}
            {...{ [PANEL_TOGGLE]: "connections" }}
            onClick={onToggleConnections}
          >
            <NotebookText aria-hidden />
            {t("nav.connectionsToggle")}
          </Button>
        </Hint>

        <MoreSheet
          connectionsOpen={connectionsOpen}
          onToggleConnections={onToggleConnections}
          annotationBoxesOpen={annotationBoxesOpen}
          onToggleAnnotationBoxes={onToggleAnnotationBoxes}
          marginToggle={scrollMode}
          pwa={pwa}
        />

        {/* Install as app: real prompt on Chromium; iOS Safari has no install
            API — the button explains the Share → Add to Home Screen path */}
        {pwa.kind === "prompt" && (
          <Hint label={t("nav.install")}>
            <Button
              variant="ghost"
              size="icon-sm"
              className="hidden sm:inline-flex"
              aria-label={t("nav.install")}
              onClick={() => void pwa.install()}
            >
              <MonitorDown />
            </Button>
          </Hint>
        )}
        {pwa.kind === "ios-instructions" && (
          <Popover>
            <Hint label={t("nav.install")}>
              <PopoverTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="hidden sm:inline-flex"
                    aria-label={t("nav.install")}
                  />
                }
              >
                <MonitorDown />
              </PopoverTrigger>
            </Hint>
            <PopoverContent className="w-72" align="end">
              <p className="mb-2 font-serif text-control font-medium">{t("nav.installIosTitle")}</p>
              <ol className="flex flex-col gap-1.5 text-meta text-muted-foreground">
                <li className="flex items-center gap-2">
                  <Share className="size-4 shrink-0 text-primary" />
                  {t("nav.installIosStep1")}
                </li>
                <li className="flex items-center gap-2">
                  <SquarePlus className="size-4 shrink-0 text-primary" />
                  {t("nav.installIosStep2")}
                </li>
              </ol>
              <p className="mt-2 text-meta text-muted-foreground">
                {t("nav.installIosWhy")}
              </p>
            </PopoverContent>
          </Popover>
        )}

        {/* Account chip (#17): settings surface — theme + language live in
            there now, keeping the nav row lean. From sm; phones use More. */}
        <AccountChip />
      </div>
    </nav>
  );
}
