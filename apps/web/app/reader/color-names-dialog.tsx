import { HIGHLIGHT_COLORS, HIGHLIGHT_LABEL_MAX, type HighlightColor } from "@biblestdy/shared";
import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { ScrollArea } from "~/components/ui/scroll-area";
import { cleanLabels, saveHighlightLabels, upFirst, useHighlightLabels } from "~/lib/highlight-labels";
import { notifyError } from "~/lib/notify";
import { HIGHLIGHT_SWATCH } from "./highlight-colors";

export { OPEN_COLOR_NAMES, openColorNames } from "./dialog-events";

/**
 * Name the highlight colours (a study's own colour code: blue = "God
 * speaking", rose = "sin"). One field per colour, its colour name as the
 * placeholder; an empty field = the colour's own name again. Saved together
 * on Save; the names then show everywhere the colour is named.
 */
export function ColorNamesDialog({
  open,
  onOpenChange,
  returnTo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnTo: React.RefObject<HTMLElement | null>;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        finalFocus={() => (returnTo.current?.isConnected ? returnTo.current : true)}
        className="sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle>{t("colorNames.title")}</DialogTitle>
          <DialogDescription>{t("colorNames.intro")}</DialogDescription>
        </DialogHeader>
        {/* Mounted per open: the fields start from the saved names */}
        {open && <ColorNamesForm onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function ColorNamesForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const ids = useId();
  const saved = useHighlightLabels();
  const [draft, setDraft] = useState<Record<HighlightColor, string>>(
    () => Object.fromEntries(HIGHLIGHT_COLORS.map((c) => [c, saved[c] ?? ""])) as Record<HighlightColor, string>,
  );
  const busy = useRef(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy.current) return;
    const next = cleanLabels(draft);
    busy.current = true;
    const save = () =>
      saveHighlightLabels(next).catch((err: unknown) => notifyError(err, { retry: save }));
    void save().finally(() => (busy.current = false));
    onDone(); // the names show at once; a failed save says so and reverts
  }

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-col gap-4">
      <ScrollArea className="-mr-3 pr-3" viewportClassName="max-h-[55dvh]">
        <ul className="flex flex-col gap-2 p-0.5">
          {HIGHLIGHT_COLORS.map((c) => (
            <li key={c} className="flex items-center gap-3">
              <span
                aria-hidden
                className="size-5 shrink-0 rounded-full ring-1 ring-foreground/15"
                style={{ background: HIGHLIGHT_SWATCH[c] }}
              />
              <label htmlFor={`${ids}-${c}`} className="w-20 shrink-0 text-control text-muted-foreground">
                {/* Always the colour itself, so the field says which one it renames */}
                {upFirst(t(`menu.colors.${c}`))}
              </label>
              <Input
                id={`${ids}-${c}`}
                value={draft[c]}
                placeholder={upFirst(t(`menu.colors.${c}`))}
                maxLength={HIGHLIGHT_LABEL_MAX}
                autoComplete="off"
                aria-describedby={`${ids}-hint`}
                onChange={(e) => setDraft((d) => ({ ...d, [c]: e.target.value }))}
                className="h-9 max-sm:h-11"
              />
            </li>
          ))}
        </ul>
      </ScrollArea>
      <p id={`${ids}-hint`} className="text-meta text-muted-foreground">
        {t("colorNames.hint", { max: HIGHLIGHT_LABEL_MAX })}
      </p>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          {t("colorNames.cancel")}
        </Button>
        <Button type="submit">{t("colorNames.save")}</Button>
      </DialogFooter>
    </form>
  );
}
