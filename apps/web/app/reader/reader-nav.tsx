import type { Translation } from "@biblestdy/shared";
import { useTranslation } from "react-i18next";
import { MonitorDown, NotebookText, Share, SquarePlus } from "lucide-react";
import { useRef } from "react";
import { Hint } from "~/components/hint";
import { Button } from "~/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { usePwaInstall } from "~/hooks/use-pwa-install";
import { useTextSize } from "~/lib/text-size";
import { cn } from "~/lib/utils";
import { SelectTrigger, SelectValue } from "~/components/ui/select";
import { SidebarTrigger } from "~/components/ui/sidebar";
import { AccountChip } from "./account-settings";
import { BookSelect } from "./book-select";
import { ChapterSelect } from "./chapter-select";
import { PANEL_TOGGLE } from "./connections-panel";
import { MoreSheet } from "./more-sheet";
import { NAME_MIN_EM, useNavWraps } from "./nav-fit";
import { PaletteTrigger } from "../palette/palette-trigger";
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
  /** The sheet's chapter strip shows (desktop, paged): no top-bar chapter chooser. */
  chapterInStrip?: boolean;
}) {
  const { t } = useTranslation();
  const pwa = usePwaInstall();
  // Large text (175%+): Notes, Search, More, Settings and the translation's
  // name drop their words, so the row holds (or wraps less)
  const iconOnly = useTextSize() >= 175;
  const rowRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLButtonElement>(null);
  const wraps = useNavWraps(rowRef, nameRef);

  return (
    <nav
      aria-label={t("nav.label")}
      className="relative shrink-0 border-b border-border bg-background/85"
    >
      <div className="h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
      {/* One row (a second row costs reading height on every phone page):
          the book name gives way (ellipsis), the rest keeps its size; phones
          reach the settings through More. Only when even a short name won't
          fit (large text, narrow pane) does the row wrap, never hiding a
          control. */}
      <div
        ref={rowRef}
        className={cn(
          "flex items-center gap-1 px-3 py-2 sm:gap-2 sm:px-4",
          wraps ? "flex-wrap" : "flex-nowrap",
        )}
      >
        <Hint label={t("nav.toggleSidebar")} shortcut="mod+B">
          <SidebarTrigger aria-label={t("nav.toggleSidebar")} />
        </Hint>

        <div className="h-4 w-px shrink-0 bg-border" />

        {/* The address — Book · Chapter · Translation — each its own
            chooser. Where the paged sheet shows the chapter strip, that is
            the chapter part (no second chooser an inch away). */}
        <BookSelect
          ref={nameRef}
          book={book}
          // Wrapped: the name stays on the first line (never alone below the
          // sidebar button) and fills what that line leaves
          style={wraps ? { flex: "1 1 0", minWidth: `${NAME_MIN_EM}em` } : undefined}
        />

        {!chapterInStrip && (
          <ChapterSelect book={book} chapter={chapter}>
            <SelectTrigger aria-label={t("nav.chapter")} size="sm" className="shrink-0 font-mono">
              <SelectValue />
            </SelectTrigger>
          </ChapterSelect>
        )}

        {/* Translation chooser (#11): marks live per translation — switching
            re-reads the chapter in the chosen version */}
        {translations.length > 1 && (
          <TranslationChooser
            translations={translations}
            translationId={translationId}
            onSwitch={onSwitchTranslation}
            iconOnly={iconOnly}
          />
        )}

        {/* Go to reference (#53): the worded field from lg, a search icon
            below (and at large text sizes) */}
        <PaletteTrigger iconOnly={iconOnly} />

        {/* "Notes & topics" (#62, was the unexplained "Connections"): icon +
            tooltip from sm, the word itself from 1180px. Phones reach it, the
            margin-notes toggle and install through the labelled More sheet. */}
        <Hint label={t("nav.connectionsToggle")} shortcut="mod+.">
          <Button
            variant={connectionsOpen ? "secondary" : "ghost"}
            size="icon-sm"
            className={cn(
              "hidden gap-1.5 sm:inline-flex",
              !iconOnly && "min-[1180px]:w-auto min-[1180px]:px-2.5",
            )}
            aria-label={t("nav.connectionsToggle")}
            aria-pressed={connectionsOpen}
            {...{ [PANEL_TOGGLE]: "connections" }}
            onClick={onToggleConnections}
          >
            <NotebookText />
            <span className={cn("hidden", !iconOnly && "min-[1180px]:inline")}>
              {t("nav.connectionsToggle")}
            </span>
          </Button>
        </Hint>

        <MoreSheet
          connectionsOpen={connectionsOpen}
          onToggleConnections={onToggleConnections}
          annotationBoxesOpen={annotationBoxesOpen}
          onToggleAnnotationBoxes={onToggleAnnotationBoxes}
          pwa={pwa}
          iconOnly={iconOnly}
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
        <AccountChip iconOnly={iconOnly} />
      </div>
    </nav>
  );
}
