import { READER_STYLES, type ReaderStyle, type Verse } from "@biblestdy/shared";
import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { Check } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "~/components/ui/dialog";
import { STYLE_CLASS, saveReaderStyle, useReaderStyle } from "~/lib/reader-style";
import { cn, focusRing } from "~/lib/utils";

/** One-time onboarding (#45): the same verse in each reader style, one tap
 * picks. Pre-selects the style the page behind already shows (#52), so the
 * preview never contradicts the page; Continue accepts. Show, don't tell.
 * A real Dialog since #62: focus trapped inside, background inert, arrow keys
 * move between the cards. Esc = Continue with the selected card (the page
 * already looks like it), so nobody is stuck; outside taps don't dismiss. */
export function StyleChooser({ verse, onDone }: { verse?: Verse; onDone: () => void }) {
  const { t } = useTranslation();
  const active = useReaderStyle();
  const [picked, setPicked] = useState<ReaderStyle>(active);
  const [busy, setBusy] = useState(false);

  async function accept() {
    if (busy) return;
    setBusy(true);
    // Applied locally even if the save fails; the chooser returns next load
    await saveReaderStyle(picked).catch(() => undefined);
    onDone();
  }

  return (
    <Dialog open disablePointerDismissal onOpenChange={(open) => !open && void accept()}>
      <DialogContent showCloseButton={false} className="gap-5 p-5 sm:max-w-xl">
        <div className="flex flex-col gap-1 text-center">
          <DialogTitle className="font-serif text-xl">{t("readerStyle.choose")}</DialogTitle>
          <DialogDescription>{t("readerStyle.changeLater")}</DialogDescription>
        </div>
        <RadioGroup
          value={picked}
          onValueChange={(v) => setPicked(v as ReaderStyle)}
          aria-label={t("readerStyle.choose")}
          className="grid gap-3 sm:grid-cols-2"
        >
          {READER_STYLES.map((style) => (
            <PreviewCard key={style} style={style} verse={verse} selected={picked === style} />
          ))}
        </RadioGroup>
        <DialogFooter className="mx-0 mb-0 justify-center border-0 bg-transparent p-0 sm:justify-center">
          <Button className="px-6" disabled={busy} onClick={() => void accept()}>
            {t("readerStyle.continue")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A preview card = one radio: selected gets ring-2 + a check (#62). */
function PreviewCard({
  style,
  verse,
  selected,
}: {
  style: ReaderStyle;
  verse?: Verse;
  selected: boolean;
}) {
  const { t } = useTranslation();
  const nameId = useId();
  return (
    <Radio.Root
      value={style}
      // Named by the style, not the whole preview verse
      aria-labelledby={nameId}
      className={cn(
        STYLE_CLASS[style],
        "relative flex cursor-pointer flex-col gap-2 rounded-xl border bg-background p-4 text-left text-foreground shadow-sm transition-shadow",
        selected ? "border-primary ring-2 ring-primary" : "hover:border-foreground/30",
        focusRing,
      )}
    >
      <span className="flex items-center justify-between font-sans text-sm font-medium">
        <span id={nameId}>{t(`readerStyle.${style}`)}</span>
        <Radio.Indicator
          keepMounted
          className="flex size-5 items-center justify-center rounded-full border border-border data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground"
        >
          {selected && <Check className="size-3.5" strokeWidth={3} />}
        </Radio.Indicator>
      </span>
      {verse && (
        <span className="line-clamp-4 block font-serif text-base leading-relaxed">
          <sup className="mr-1 font-sans text-xs text-muted-foreground">{verse.verse}</sup>
          {verse.text}
        </span>
      )}
      <span className="mt-1 flex gap-1.5" aria-hidden>
        <span className="h-1.5 w-8 rounded-full bg-primary" />
        <span className="h-1.5 w-5 rounded-full bg-muted" />
        <span className="h-1.5 w-5 rounded-full" style={{ background: "var(--hl-gold)" }} />
      </span>
    </Radio.Root>
  );
}
