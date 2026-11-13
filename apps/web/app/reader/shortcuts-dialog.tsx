import { Fragment } from "react";
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

/** Event name: anything (the settings menu) can open the list. */
export const OPEN_SHORTCUTS = "biblestdy:shortcuts";

/** One row: alternatives are separated by "or", combos by "+". "mod" = ⌘/Ctrl. */
type Row = { keys: string[][]; label: string };

function Keys({ keys }: { keys: string[][] }) {
  const { t } = useTranslation();
  const mod = modKey().replace("+", "");
  return (
    <span className="flex flex-wrap items-center justify-end gap-1">
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

/**
 * `?` overlay (#65): every keyboard shortcut of the reader in one list.
 * Opened by `?` (read route) or the settings menu's "Keyboard shortcuts".
 */
export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation();
  const groups: { title: string; rows: Row[] }[] = [
    {
      title: t("shortcuts.reading"),
      rows: [
        { keys: [["←"], ["→"]], label: t("shortcuts.pageTurn") },
        { keys: [["Home"], ["End"]], label: t("shortcuts.firstLast") },
        { keys: [["["], ["]"]], label: t("shortcuts.chapter") },
        { keys: [["/"]], label: t("shortcuts.jump") },
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
        { keys: [["Esc"]], label: t("shortcuts.clear") },
      ],
    },
    {
      title: t("shortcuts.panels"),
      rows: [
        { keys: [["mod", "."]], label: t("shortcuts.connections") },
        { keys: [["F6"]], label: t("shortcuts.cycle") },
        { keys: [["mod", "Enter"]], label: t("shortcuts.closeNote") },
        { keys: [["Esc"]], label: t("shortcuts.closePanel") },
        { keys: [["mod", "B"]], label: t("shortcuts.sidebar") },
        { keys: [["?"]], label: t("shortcuts.help") },
      ],
    },
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("shortcuts.title")}</DialogTitle>
          <DialogDescription>{t("shortcuts.intro")}</DialogDescription>
        </DialogHeader>
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
