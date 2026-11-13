import { READER_STYLES, type ReaderStyle, type Verse } from "@biblestdy/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "~/components/ui/button";
import { STYLE_CLASS, saveReaderStyle } from "~/lib/reader-style";
import { cn } from "~/lib/utils";

/** One-time onboarding (#45): the same verse in each reader style, one tap
 * picks. Clean pre-selected; Continue accepts. Show, don't tell. */
export function StyleChooser({ verse, onDone }: { verse?: Verse; onDone: () => void }) {
  const { t } = useTranslation();
  const [picked, setPicked] = useState<ReaderStyle>("clean");
  const [busy, setBusy] = useState(false);

  async function accept() {
    setBusy(true);
    // Applied locally even if the save fails; the chooser returns next load
    await saveReaderStyle(picked).catch(() => undefined);
    onDone();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="style-chooser-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
    >
      <div className="flex w-full max-w-xl flex-col gap-4">
        <h2 id="style-chooser-title" className="text-center text-sm font-medium">
          {t("readerStyle.choose")}
        </h2>
        <div role="radiogroup" className="grid gap-3 sm:grid-cols-2">
          {READER_STYLES.map((style) => (
            <PreviewCard
              key={style}
              style={style}
              verse={verse}
              selected={picked === style}
              onSelect={() => setPicked(style)}
            />
          ))}
        </div>
        <Button className="self-center px-6" disabled={busy} onClick={() => void accept()}>
          {t("readerStyle.continue")}
        </Button>
      </div>
    </div>
  );
}

function PreviewCard({
  style,
  verse,
  selected,
  onSelect,
}: {
  style: ReaderStyle;
  verse?: Verse;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        STYLE_CLASS[style],
        "flex flex-col gap-2 rounded-xl border bg-background p-4 text-left text-foreground shadow-sm transition-shadow",
        selected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "opacity-80 hover:opacity-100",
      )}
    >
      <span className="font-sans text-xs font-medium text-muted-foreground">
        {t(`readerStyle.${style}`)}
      </span>
      {verse && (
        <p className="line-clamp-4 font-serif text-base leading-relaxed">
          <sup className="mr-1 font-sans text-[0.6rem] text-muted-foreground">{verse.verse}</sup>
          {verse.text}
        </p>
      )}
      <span className="mt-1 flex gap-1.5" aria-hidden>
        <span className="h-1.5 w-8 rounded-full bg-primary" />
        <span className="h-1.5 w-5 rounded-full bg-muted" />
        <span className="h-1.5 w-5 rounded-full" style={{ background: "var(--hl-gold)" }} />
      </span>
    </button>
  );
}
