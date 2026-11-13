import type { Translation } from "@biblestdy/shared";
import { getBook } from "@biblestdy/shared";
import { useTranslation } from "react-i18next";
import { Layers, MonitorDown, Share, SquarePlus, Waypoints } from "lucide-react";
import { useNavigate } from "react-router";
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
import { JumpBox } from "./jump-box";

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
  const { t } = useTranslation();
  const navigate = useNavigate();
  const pwa = usePwaInstall();
  const nameOf = useBookName();
  const current = getBook(book);
  const chapterCount = current?.chapters ?? 1;

  return (
    <nav className="relative shrink-0 border-b border-border bg-background/85">
      <div className="h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
      <div className="flex items-center gap-1 px-3 py-2 sm:gap-2 sm:px-4">
        <SidebarTrigger aria-label={t("nav.toggleSidebar")} />

        <div className="h-4 w-px bg-border" />

        <span className="min-w-0 truncate font-serif text-sm font-medium">
          {nameOf(book)}
        </span>

        <Select
          value={String(chapter)}
          onValueChange={(value) => navigate(`/read/${book}/${String(value)}`)}
        >
          <SelectTrigger aria-label={t("nav.chapter")} size="sm" className="font-mono">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: chapterCount }, (_, i) => i + 1).map((c) => (
              <SelectItem key={c} value={String(c)} className="font-mono">
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
                    <span className="hidden max-w-44 truncate text-xs text-muted-foreground lg:inline">
                      {tr.name}
                    </span>
                  </>
                ) : (
                  <SelectValue />
                );
              })()}
            </SelectTrigger>
            {/* Dropdown defaults to trigger width (now abbr-narrow) — size to content */}
            <SelectContent className="w-auto min-w-(--anchor-width) max-w-80">
              {translations.map((tr) => (
                <SelectItem key={tr.id} value={tr.id} title={tr.name}>
                  {/* Fixed abbr column: names align despite NIV/NKJV width gap */}
                  <span className="w-12 shrink-0 font-mono">{tr.abbreviation}</span>
                  <span className="truncate text-xs text-muted-foreground">{tr.name}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Go to reference (#53): inline from sm, a search icon on phones */}
        <JumpBox />

        <Button
          variant={connectionsOpen ? "secondary" : "ghost"}
          size="icon-sm"
          aria-label={t("nav.connectionsToggle")}
          aria-pressed={connectionsOpen}
          title={t("nav.connectionsHint")}
          onClick={onToggleConnections}
        >
          <Waypoints />
        </Button>

        {/* Mobile-only (#15): annotation-box layer toggle — off = clean page
            (washes + circles stay), on = computed boxes. Desktop always shows. */}
        <Button
          variant={annotationBoxesOpen ? "secondary" : "ghost"}
          size="icon-sm"
          className="sm:hidden"
          aria-label={t("nav.annotationsToggle")}
          aria-pressed={annotationBoxesOpen}
          title={t("nav.annotationsHint")}
          onClick={onToggleAnnotationBoxes}
        >
          <Layers />
        </Button>

        {/* Install as app: real prompt on Chromium; iOS Safari has no install
            API — the button explains the Share → Add to Home Screen path */}
        {pwa.kind === "prompt" && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("nav.install")}
            title={t("nav.install")}
            onClick={() => void pwa.install()}
          >
            <MonitorDown />
          </Button>
        )}
        {pwa.kind === "ios-instructions" && (
          <Popover>
            <PopoverTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("nav.install")}
                  title={t("nav.install")}
                />
              }
            >
              <MonitorDown />
            </PopoverTrigger>
            <PopoverContent className="w-72" align="end">
              <p className="mb-2 font-serif text-sm font-medium">{t("nav.installIosTitle")}</p>
              <ol className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                <li className="flex items-center gap-2">
                  <Share className="size-3.5 shrink-0 text-primary" />
                  {t("nav.installIosStep1")}
                </li>
                <li className="flex items-center gap-2">
                  <SquarePlus className="size-3.5 shrink-0 text-primary" />
                  {t("nav.installIosStep2")}
                </li>
              </ol>
              <p className="mt-2 font-mono text-[0.6rem] text-muted-foreground/70">
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
