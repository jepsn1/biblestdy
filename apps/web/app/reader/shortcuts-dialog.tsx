import { Fragment, useId } from "react";
import { useTranslation } from "react-i18next";
import { modKey } from "~/components/hint";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Switch } from "~/components/ui/switch";
import { notifyError } from "~/lib/notify";
import { isCharacterShortcut, saveSingleKeys, useSingleKeys } from "~/lib/shortcuts";
import { cn } from "~/lib/utils";

export { OPEN_SHORTCUTS } from "./dialog-events";

/** One row: alternatives are separated by "or", combos by "+". "mod" = ⌘/Ctrl. */
type Row = { keys: string[][]; label: string };

function Keys({ keys }: { keys: string[][] }) {
  const { t } = useTranslation();
  const mod = modKey().replace("+", "");
  return (
    <span className="flex shrink-0 items-center justify-end gap-1 whitespace-nowrap">
      {keys.map((combo, i) => (
        <Fragment key={i}>
          {i > 0 && <span className="text-meta text-muted-foreground">{t("shortcuts.or")}</span>}
          {combo.map((k) => (
            <kbd
              key={k}
              data-slot="kbd"
              className="min-w-6 rounded border border-border bg-muted px-1.5 text-center font-mono text-meta leading-5"
            >
              {k === "mod" ? mod : k}
            </kbd>
          ))}
        </Fragment>
      ))}
    </span>
  );
}

function save(on: boolean) {
  saveSingleKeys(on).catch((e: unknown) => notifyError(e, { retry: () => save(on) }));
}

/**
 * The single-key shortcuts switch (#145, WCAG 2.1.4), in Settings (every
 * device: an iPad with a keyboard fires them too) and atop the `?` list —
 * one account setting. Label + a description that says what off means.
 */
export function SingleKeysSwitch({ className }: { className?: string }) {
  const { t } = useTranslation();
  const ids = useId();
  const on = useSingleKeys();
  return (
    <div className={cn("flex items-start justify-between gap-4 py-2", className)}>
      <div className="min-w-0">
        <label htmlFor={`${ids}-switch`} id={`${ids}-label`} className="text-control">
          {t("shortcuts.singleKeys")}
        </label>
        <p id={`${ids}-desc`} className="text-meta text-muted-foreground">
          {t(on ? "shortcuts.singleKeysOn" : "shortcuts.singleKeysOff")}
        </p>
      </div>
      <Switch
        id={`${ids}-switch`}
        checked={on}
        onCheckedChange={save}
        aria-labelledby={`${ids}-label`}
        aria-describedby={`${ids}-desc`}
        // Off reads by its grey track (WCAG 1.4.11); bigger on a phone
        className="mt-0.5 origin-right max-sm:mt-1.5 max-sm:scale-125"
      />
    </div>
  );
}

/**
 * `?` overlay (#65): every keyboard shortcut of the reader in one list.
 * Opened by `?` (read route) or the settings menu's "Keyboard shortcuts".
 * Single-key shortcuts off (#145): only the keys that still work are listed.
 */
export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation();
  const singleKeys = useSingleKeys();
  const all: { title: string; rows: Row[] }[] = [
    {
      title: t("shortcuts.reading"),
      rows: [
        { keys: [["←", "→"], ["PgUp", "PgDn"]], label: t("shortcuts.pageTurn") },
        { keys: [["Home"], ["End"]], label: t("shortcuts.firstLast") },
        { keys: [["["], ["]"]], label: t("shortcuts.chapter") },
        { keys: [["mod", "K"], ["/"]], label: t("shortcuts.jump") },
        { keys: [["mod", "B"]], label: t("shortcuts.place") },
        { keys: [["t"]], label: t("shortcuts.translation") },
      ],
    },
    {
      title: t("shortcuts.text"),
      rows: [
        { keys: [["↑"], ["↓"]], label: t("shortcuts.verse") },
        { keys: [["Shift", "←"], ["Shift", "→"]], label: t("shortcuts.selectWords") },
        { keys: [["Shift", "↑"], ["Shift", "↓"]], label: t("shortcuts.selectVerses") },
        { keys: [["Enter"]], label: t("shortcuts.menu") },
        { keys: [["h"]], label: t("shortcuts.highlight") },
        { keys: [["n"]], label: t("shortcuts.note") },
        { keys: [["m"]], label: t("shortcuts.annotate") },
        { keys: [["c"]], label: t("shortcuts.copy") },
        { keys: [["p"]], label: t("shortcuts.compare") },
        { keys: [["Esc"]], label: t("shortcuts.clear") },
      ],
    },
    {
      title: t("tools.label"),
      rows: [
        { keys: [["V"], ["Esc"]], label: t("tools.select") },
        { keys: [["Shift", "H"]], label: t("shortcuts.highlighter") },
        { keys: [["1–6"]], label: t("shortcuts.highlightColor") },
        { keys: [["Shift", "M"]], label: t("tools.annotate") },
        { keys: [["1–5"]], label: t("shortcuts.penStyle") },
        { keys: [["Shift", "N"]], label: t("tools.note") },
        { keys: [["Shift", "E"]], label: t("tools.erase") },
      ],
    },
    {
      title: t("shortcuts.panels"),
      rows: [
        { keys: [["mod", "."]], label: t("shortcuts.connections") },
        { keys: [["F6"]], label: t("shortcuts.cycle") },
        { keys: [["mod", "Enter"]], label: t("shortcuts.closeNote") },
        { keys: [["Esc"]], label: t("shortcuts.closePanel") },

        { keys: [["?"]], label: t("shortcuts.help") },
      ],
    },
  ];
  const groups = all
    .map((g) => ({
      ...g,
      rows: g.rows
        .map((r) => ({ ...r, keys: r.keys.filter((combo) => singleKeys || !isCharacterShortcut(combo.join("+"))) }))
        .filter((r) => r.keys.length > 0),
    }))
    .filter((g) => g.rows.length > 0);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("shortcuts.title")}</DialogTitle>
          <DialogDescription>{t(singleKeys ? "shortcuts.intro" : "shortcuts.offIntro")}</DialogDescription>
        </DialogHeader>
        <SingleKeysSwitch className="rounded-lg bg-muted px-3" />
        <ScrollArea className="-mr-3 pr-3" viewportClassName="max-h-[70dvh]">
        <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          {groups.map((g) => (
            <section key={g.title} className={g.rows.length > 6 ? "sm:row-span-2" : undefined}>
              <h3 className="eyebrow mb-1.5">
                {g.title}
              </h3>
              <dl className="flex flex-col gap-1 text-control">
                {g.rows.map((r) => (
                  <div key={r.label} className="flex items-center justify-between gap-3">
                    <dt>{r.label}</dt>
                    <dd>
                      <Keys keys={r.keys} />
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
