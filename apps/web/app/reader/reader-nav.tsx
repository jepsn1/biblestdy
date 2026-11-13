import type { Translation } from "@biblestdy/shared";
import { getBook } from "@biblestdy/shared";
import { useTranslation } from "react-i18next";
import { MonitorDown, NotebookText, Share, SquarePlus } from "lucide-react";
import { useNavigate } from "react-router";
import { Hint } from "~/components/hint";
import { Button } from "~/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { usePwaInstall } from "~/hooks/use-pwa-install";
import { useBookName } from "~/lib/book-name";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { SidebarTrigger } from "~/components/ui/sidebar";
import { AccountChip } from "./account-settings";
import { PANEL_TOGGLE } from "./connections-panel";
import { JumpBox } from "./jump-box";
import { MoreSheet } from "./more-sheet";

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
}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const pwa = usePwaInstall();
  const nameOf = useBookName();
  const current = getBook(book);
  const chapterCount = current?.chapters ?? 1;
  const uiLanguage = i18n.language.split("-")[0];
  const languageName = (code: string) => {
    if (!code || code.split("-")[0] === uiLanguage) return null;
    try {
      return new Intl.DisplayNames([i18n.language], { type: "language" }).of(code) ?? null;
    } catch {
      return null;
    }
  };

  return (
    <nav
      aria-label={t("nav.label")}
      className="relative shrink-0 border-b border-border bg-background/85"
    >
      <div className="h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
      <div className="flex flex-wrap items-center gap-1 px-3 py-2 sm:gap-2 sm:px-4">
        <Hint label={t("nav.toggleSidebar")} shortcut="mod+B">
          <SidebarTrigger aria-label={t("nav.toggleSidebar")} />
        </Hint>

        <div className="h-4 w-px bg-border" />

        <span className="min-w-0 truncate font-serif text-control font-medium">
          {nameOf(book)}
        </span>

        <Select
          value={String(chapter)}
          onValueChange={(value) => navigate(`/read/${book}/${String(value)}`)}
        >
          <SelectTrigger aria-label={t("nav.chapter")} size="sm" className="font-mono">
            <SelectValue />
          </SelectTrigger>
          {/* Number grid (#62): Psalms' 150 chapters in a few rows, not a
              150-row list; anchored below the trigger like every menu */}
          <SelectContent
            alignItemWithTrigger={false}
            align="start"
            className="w-auto"
            listClassName="grid grid-cols-[repeat(6,2.5rem)] gap-0.5 p-1"
          >
            {Array.from({ length: chapterCount }, (_, i) => i + 1).map((c) => (
              <SelectItem
                key={c}
                value={String(c)}
                indicator={false}
                className="h-9 justify-center px-0 font-mono tabular-nums data-selected:font-semibold data-selected:ring-2 data-selected:ring-primary data-selected:ring-inset"
              >
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Translation switcher (#11): marks live per translation — switching
            re-reads the chapter in the chosen version */}
        {translations.length > 1 && (
          <Select value={translationId} onValueChange={(v) => v && onSwitchTranslation(v)}>
            <SelectTrigger aria-label={t("nav.translation")} size="sm">
              {/* Explicit label: SelectValue would fall back to the raw value
                  (an opaque API.Bible id) in the trigger */}
              {(() => {
                const tr = translations.find((x) => x.id === translationId);
                return tr ? (
                  <>
                    <span className="font-mono">{tr.abbreviation}</span>
                    <span className="hidden max-w-44 truncate text-meta text-muted-foreground lg:inline">
                      {tr.name}
                    </span>
                  </>
                ) : (
                  <SelectValue />
                );
              })()}
            </SelectTrigger>
            {/* Anchored below the trigger (#62); rows are a two-column grid
                (abbr | name) so names align and long ones end in an ellipsis */}
            <SelectContent
              alignItemWithTrigger={false}
              align="start"
              className="w-80 max-w-[calc(100vw-1rem)]"
            >
              {translations.map((tr) => (
                <SelectItem key={tr.id} value={tr.id} title={tr.name} className="min-h-9">
                  <span className="grid w-full min-w-0 grid-cols-[3.25rem_minmax(0,1fr)] items-baseline gap-2">
                    <span className="font-mono">{tr.abbreviation}</span>
                    <span className="truncate text-meta text-muted-foreground">
                      {tr.name}
                      {/* The text's language when it isn't the UI's (#66): "· engelsk" */}
                      {languageName(tr.language) && ` · ${languageName(tr.language)}`}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Go to reference (#53): inline from sm, a search icon on phones */}
        <JumpBox />

        {/* "Notes & topics" (#62, was the unexplained "Connections"): icon +
            tooltip from sm, the word itself from 1180px. Phones reach it, the
            margin-notes toggle and install through the labelled More sheet. */}
        <Hint label={t("nav.connectionsToggle")} shortcut="mod+.">
          <Button
            variant={connectionsOpen ? "secondary" : "ghost"}
            size="icon-sm"
            className="hidden gap-1.5 sm:inline-flex min-[1180px]:w-auto min-[1180px]:px-2.5"
            aria-label={t("nav.connectionsToggle")}
            aria-pressed={connectionsOpen}
            {...{ [PANEL_TOGGLE]: "connections" }}
            onClick={onToggleConnections}
          >
            <NotebookText />
            <span className="hidden min-[1180px]:inline">{t("nav.connectionsToggle")}</span>
          </Button>
        </Hint>

        <MoreSheet
          connectionsOpen={connectionsOpen}
          onToggleConnections={onToggleConnections}
          annotationBoxesOpen={annotationBoxesOpen}
          onToggleAnnotationBoxes={onToggleAnnotationBoxes}
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
            there now, keeping the nav row lean */}
        <AccountChip />
      </div>
    </nav>
  );
}
