import type { Translation } from "@biblestdy/shared";
import { getBook, parseReference } from "@biblestdy/shared";
import { useTranslation } from "react-i18next";
import { Waypoints } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { SidebarTrigger } from "~/components/ui/sidebar";
import { ThemeToggle } from "~/components/theme-toggle";
import { setUiLanguage } from "~/lib/i18n";

export function ReaderNav({
  book,
  chapter,
  translations,
  translationId,
  onSwitchTranslation,
  connectionsOpen,
  onToggleConnections,
}: {
  book: string;
  chapter: number;
  translations: Translation[];
  translationId: string;
  onSwitchTranslation: (id: string) => void;
  connectionsOpen: boolean;
  onToggleConnections: () => void;
}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const jumpRef = useRef<HTMLInputElement>(null);
  const [jump, setJump] = useState("");
  const [jumpError, setJumpError] = useState(false);

  const current = getBook(book);
  const chapterCount = current?.chapters ?? 1;

  // "/" focuses the jump box from anywhere
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      const typing = target.tagName === "INPUT" || target.tagName === "TEXTAREA";
      if (event.key === "/" && !typing) {
        event.preventDefault();
        jumpRef.current?.focus();
      } else if (event.key === "Escape" && target === jumpRef.current) {
        jumpRef.current?.blur();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function onJump(event: React.FormEvent) {
    event.preventDefault();
    const ref = parseReference(jump);
    if (!ref) {
      setJumpError(true);
      return;
    }
    setJumpError(false);
    setJump("");
    jumpRef.current?.blur();
    navigate(`/read/${ref.book}/${ref.chapter ?? 1}`);
  }

  return (
    <nav className="shrink-0 border-b border-border bg-background/85">
      <div className="h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
      <div className="flex items-center gap-2 px-4 py-2">
        <SidebarTrigger aria-label={t("nav.toggleSidebar")} />

        <div className="h-4 w-px bg-border" />

        <span className="font-serif text-sm font-medium">{current?.name ?? book}</span>

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
                  <span className="font-mono">{tr.abbreviation}</span>
                  <span className="ml-2 truncate text-xs text-muted-foreground">{tr.name}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <form onSubmit={onJump} className="relative ml-auto hidden sm:block">
          <Input
            ref={jumpRef}
            aria-label={t("nav.goToReference")}
            placeholder={t("nav.goToReference")}
            value={jump}
            onChange={(e) => {
              setJump(e.target.value);
              setJumpError(false);
            }}
            aria-invalid={jumpError || undefined}
            className="h-7 w-44 pr-8 font-mono text-xs placeholder:font-sans"
          />
          <kbd className="pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2 rounded border border-border bg-muted px-1 font-mono text-[0.6rem] text-muted-foreground">
            /
          </kbd>
        </form>

        <Button
          variant={connectionsOpen ? "secondary" : "ghost"}
          size="icon-sm"
          className="ml-auto sm:ml-0"
          aria-label={t("nav.connectionsToggle")}
          aria-pressed={connectionsOpen}
          title={t("nav.connectionsHint")}
          onClick={onToggleConnections}
        >
          <Waypoints />
        </Button>

        {/* UI language (issue #12) — independent of the Scripture translation */}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("nav.language")}
          title={t("nav.language")}
          onClick={() => setUiLanguage(i18n.language.startsWith("da") ? "en" : "da")}
        >
          <span className="font-mono text-[0.6rem] font-semibold">
            {i18n.language.startsWith("da") ? "DA" : "EN"}
          </span>
        </Button>

        <ThemeToggle />
      </div>
    </nav>
  );
}
