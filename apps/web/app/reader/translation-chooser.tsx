import type { Translation } from "@biblestdy/shared";
import { translationInfo } from "@biblestdy/shared";
import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Hint } from "~/components/hint";
import { Button } from "~/components/ui/button";
import { Drawer, DrawerContent, DrawerTitle } from "~/components/ui/drawer";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "~/components/ui/popover";
import { ScrollArea } from "~/components/ui/scroll-area";
import { useIsMobile } from "~/hooks/use-mobile";
import { ignoreShortcut } from "~/lib/shortcuts";
import { cn } from "~/lib/utils";
import { PanelHeader, panelTitleClass } from "./panel-header";

/** Event name: anything (the command palette) can open the chooser. */
export const OPEN_TRANSLATIONS = "biblestdy:translations";

type Lang = "en" | "da";

/** Title in the text's own language (no English gloss inside it). */
export function translationTitle(tr: Translation): string {
  return translationInfo(tr.abbreviation)?.name ?? tr.name;
}

/** Translations grouped by language, the UI's language first. */
export function groupTranslations(translations: Translation[], ui: Lang) {
  const groups = new Map<string, Translation[]>();
  for (const tr of translations) {
    const lang = tr.language.split("-")[0];
    groups.set(lang, [...(groups.get(lang) ?? []), tr]);
  }
  return [...groups.entries()].sort(([a], [b]) => Number(b === ui) - Number(a === ui));
}

/**
 * Translation chooser (replaces the Select): a labelled panel, one row per
 * translation grouped by language, full names that wrap (never cut off), a
 * plain-language line + rights line from the static catalog. Popover on
 * desktop, bottom sheet on phones. `t` opens it; ↑/↓ move, Enter picks.
 * Switching keeps the chapter; a toast says the old version's marks are kept
 * and offers the way back.
 */
export function TranslationChooser({
  translations,
  translationId,
  onSwitch,
}: {
  translations: Translation[];
  translationId: string;
  onSwitch: (id: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const ui: Lang = i18n.language.startsWith("da") ? "da" : "en";
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const current = translations.find((x) => x.id === translationId) ?? translations[0];

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "t" && !e.shiftKey && !ignoreShortcut(e)) {
        e.preventDefault();
        setOpen(true);
      }
    }
    const show = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_TRANSLATIONS, show);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_TRANSLATIONS, show);
    };
  }, []);

  function pick(tr: Translation) {
    setOpen(false);
    if (tr.id === current.id) return;
    const prev = current;
    onSwitch(tr.id);
    toast(t("translations.switched", { name: translationTitle(tr), prev: prev.abbreviation }), {
      action: { label: t("translations.back", { abbr: prev.abbreviation }), onClick: () => onSwitch(prev.id) },
    });
  }

  const label = `${t("nav.translation")}: ${current.abbreviation}, ${translationTitle(current)}`;
  const list = <TranslationList translations={translations} currentId={current.id} ui={ui} onPick={pick} />;
  const trigger = (
    <>
      <span className="text-control font-medium tracking-[0.02em]">{current.abbreviation}</span>
      <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
    </>
  );

  if (isMobile) {
    return (
      <>
        <Button variant="outline" size="sm" aria-label={label} aria-haspopup="dialog" onClick={() => setOpen(true)}>
          {trigger}
        </Button>
        <Drawer open={open} onOpenChange={setOpen} showSwipeHandle>
          <DrawerContent className="[--drawer-content-max-height:92dvh]">
            <PanelHeader onClose={() => setOpen(false)} closeLabel={t("translations.close")}>
              <DrawerTitle className={panelTitleClass}>{t("translations.title")}</DrawerTitle>
            </PanelHeader>
            <ScrollArea className="min-h-0 flex-1">
              <div className="px-2 pt-1 pb-8">{list}</div>
            </ScrollArea>
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Hint label={translationTitle(current)} shortcut="T">
        <PopoverTrigger render={<Button variant="outline" size="sm" aria-label={label} />}>{trigger}</PopoverTrigger>
      </Hint>
      <PopoverContent align="start" className="w-90 max-w-[calc(100vw-2rem)] gap-0 p-0">
        <PanelHeader onClose={() => setOpen(false)} closeLabel={t("translations.close")}>
          <PopoverTitle className={panelTitleClass}>{t("translations.title")}</PopoverTitle>
        </PanelHeader>
        <ScrollArea viewportClassName="max-h-[70dvh]">
          <div className="p-1.5">{list}</div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

function TranslationList({
  translations,
  currentId,
  ui,
  onPick,
}: {
  translations: Translation[];
  currentId: string;
  ui: Lang;
  onPick: (tr: Translation) => void;
}) {
  const { t, i18n } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const languageName = (code: string) => {
    try {
      return new Intl.DisplayNames([i18n.language], { type: "language" }).of(code) ?? code;
    } catch {
      return code;
    }
  };

  // Focus starts on the current translation; ↑/↓ (and Home/End) move between rows
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rows = () => [...el.querySelectorAll<HTMLButtonElement>("[data-translation-option]")];
    requestAnimationFrame(() => rows().find((r) => r.getAttribute("aria-current") === "true")?.focus());
    function onKey(e: KeyboardEvent) {
      const all = rows();
      const i = all.indexOf(document.activeElement as HTMLButtonElement);
      const to = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: all.length - 1 }[e.key];
      if (to === undefined) return;
      e.preventDefault();
      all[Math.max(0, Math.min(all.length - 1, to))]?.focus();
    }
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div ref={ref} className="flex flex-col gap-1.5">
      {groupTranslations(translations, ui).map(([lang, items]) => (
        <section key={lang} aria-label={languageName(lang)}>
          <h3 className="eyebrow px-3 pt-2 pb-1">{languageName(lang)}</h3>
          <ul className="flex flex-col gap-1">
            {items.map((tr) => {
              const info = translationInfo(tr.abbreviation);
              const selected = tr.id === currentId;
              const meta = [tr.abbreviation, info?.description[ui]].filter(Boolean).join(" · ");
              return (
                <li key={tr.id}>
                  <button
                    type="button"
                    data-translation-option
                    aria-current={selected ? "true" : undefined}
                    onClick={() => onPick(tr)}
                    className={cn(
                      "flex w-full min-h-12 items-start gap-3 rounded-md px-3 py-2.5 text-left outline-none hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring max-sm:min-h-14",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className={cn("block text-control max-sm:text-phone", selected && "font-medium")}>
                        {translationTitle(tr)}
                        {info?.gloss && ui !== lang && (
                          <span className="text-muted-foreground"> ({info.gloss})</span>
                        )}
                      </span>
                      <span className="mt-0.5 block text-meta text-muted-foreground">{meta}</span>
                      {info && <span className="block text-meta text-muted-foreground">{info.rights[ui]}</span>}
                    </span>
                    <span className="flex w-6 shrink-0 justify-end pt-0.5">
                      {selected && (
                        <>
                          <Check className="size-4 text-primary" aria-hidden />
                          <span className="sr-only">{t("translations.selected")}</span>
                        </>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
