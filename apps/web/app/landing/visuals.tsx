import { HIGHLIGHT_COLORS, type HighlightColor } from "@biblestdy/shared";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { HIGHLIGHT_BG, HIGHLIGHT_SWATCH, NOTE_INK, NOTE_INK_TEXT } from "~/reader/highlight-colors";
import { bracketPath, scribblePath } from "~/reader/scribble";
import { cn, focusRing } from "~/lib/utils";

/** Landing-page illustrations: small, real-looking pieces of the reader
 * (same tokens, inks and scribble geometry as the app), no data. Scripture
 * is the World English Bible (public domain), English in every UI language;
 * only the reader's own notes are localized. Decorative pieces are
 * aria-hidden — the section copy says the same in words. */

const wash = (c: HighlightColor) => ({
  backgroundImage: `linear-gradient(${HIGHLIGHT_BG[c]}, ${HIGHLIGHT_BG[c]})`,
});

/** Paper's reading face, pinned — the visitor's stored style must not leak in. */
const PAPER_FONT = "[--font-reading:'Literata_Variable',ui-serif,Georgia,serif]";

/** A hand-drawn pen underline beneath its children; inks itself on load. */
export function InkUnderline({ children }: { children: React.ReactNode }) {
  return (
    <span className="relative inline-block">
      {children}
      <svg
        aria-hidden
        viewBox="0 0 200 12"
        preserveAspectRatio="none"
        className="pointer-events-none absolute -bottom-2 left-1/2 h-3 w-[92%] -translate-x-1/2 overflow-visible"
      >
        <path
          d="M 3 8 Q 40 3.5 82 6.5 T 160 5.5 Q 182 5 197 3"
          pathLength={1}
          className="landing-ink"
          fill="none"
          stroke="var(--primary)"
          strokeWidth={2.5}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </span>
  );
}

/** Card art: a verse with a wash you can recolour (the one interactive toy). */
export function HighlightDemo() {
  const { t } = useTranslation();
  const [color, setColor] = useState<HighlightColor>("gold");
  return (
    <div className="flex h-full flex-col justify-between gap-4">
      <p aria-hidden className="font-serif text-reading leading-relaxed">
        <span
          className="rounded-[3px] px-0.5 box-decoration-clone transition-[background-image]"
          style={wash(color)}
        >
          Yahweh is my shepherd;
        </span>{" "}
        I shall lack nothing.
        <span className="mt-1 block font-mono text-meta text-muted-foreground">Psalm 23:1</span>
      </p>
      <div role="group" aria-label={t("landing.vis.tryColours")} className="flex flex-wrap items-center gap-2">
        <span className="w-full text-meta text-muted-foreground">{t("landing.vis.tryColours")}</span>
        {HIGHLIGHT_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={t(`menu.colors.${c}`)}
            aria-pressed={color === c}
            onClick={() => setColor(c)}
            className={cn(
              "size-6 rounded-full border border-border transition-transform hover:scale-110",
              color === c && "ring-2 ring-foreground/60 ring-offset-2 ring-offset-background",
              focusRing,
            )}
            style={{ background: HIGHLIGHT_SWATCH[c] }}
          />
        ))}
      </div>
    </div>
  );
}

const BE_STILL = scribblePath(0, 0, 100, 20, "landing-be-still");
const BRACKET = bracketPath(6, 2, 58, "landing-ps46", 1);

/** Card art: a pen circle + bracket and a scribbled thought in the margin. */
export function MarginDemo() {
  const { t } = useTranslation();
  return (
    <div aria-hidden className="grid grid-cols-[1rem_1fr] gap-x-2">
      <svg viewBox="0 0 16 60" preserveAspectRatio="none" className="h-full w-4 overflow-visible">
        <path
          d={BRACKET}
          fill="none"
          stroke={NOTE_INK}
          strokeWidth={1.5}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div>
        <p className="font-serif text-reading leading-relaxed">
          “
          <span className="relative inline-block">
            Be still,
            <svg
              viewBox="0 0 100 20"
              preserveAspectRatio="none"
              className="pointer-events-none absolute inset-0 size-full overflow-visible"
            >
              <path
                d={BE_STILL}
                fill="none"
                stroke={NOTE_INK}
                strokeWidth={1.5}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          </span>{" "}
          and know that I am God.”
        </p>
        <p className="mt-1 font-mono text-meta text-muted-foreground">Psalm 46:10</p>
        <p
          className="mt-3 -rotate-2 font-serif text-list leading-snug italic"
          style={{ color: NOTE_INK_TEXT }}
        >
          {t("landing.vis.marginNote")}
        </p>
      </div>
    </div>
  );
}

/** Card art: a little note document with its passages. */
export function NoteDemo() {
  const { t } = useTranslation();
  return (
    <div aria-hidden className="rounded-md border border-border bg-card p-3 shadow-sm">
      <p className="font-serif text-phone font-medium">{t("landing.vis.noteTitle")}</p>
      <p className="mt-1 text-list leading-snug text-muted-foreground">{t("landing.vis.noteBody")}</p>
      <div className="mt-2 space-y-1">
        <div className="h-1.5 w-11/12 rounded-full bg-muted-foreground/15" />
        <div className="h-1.5 w-3/4 rounded-full bg-muted-foreground/15" />
      </div>
      <div className="mt-3 flex flex-wrap gap-1">
        {["Ps 46:10", "1 Kgs 19:12"].map((ref) => (
          <span
            key={ref}
            className="rounded-full border border-border bg-background px-2 py-0.5 font-mono text-meta text-muted-foreground"
          >
            {ref}
          </span>
        ))}
      </div>
    </div>
  );
}

const PASSAGES = [
  {
    ref: "John 3:16",
    text: "For God so loved the world, that he gave his only born Son…",
    hl: "gold" as HighlightColor,
  },
  {
    ref: "Romans 5:8",
    text: "But God commends his own love toward us, in that while we were yet sinners, Christ died for us.",
    hl: "rose" as HighlightColor,
  },
  {
    ref: "1 John 4:9",
    text: "By this God’s love was revealed in us, that God has sent his only born Son into the world…",
    hl: "green" as HighlightColor,
  },
];

/** One note, three passages: hand-drawn threads from each passage to the note. */
export function ConnectionsDiagram() {
  const { t } = useTranslation();
  return (
    <figure className="mx-auto max-w-4xl">
      <div aria-hidden>
        <div className="grid gap-3 sm:grid-cols-3">
          {PASSAGES.map((p) => (
            <div key={p.ref} className="rounded-lg border border-border bg-background p-4">
              <p className="font-mono text-meta text-muted-foreground">{p.ref}</p>
              <p className="mt-2 font-serif text-control leading-relaxed">
                <span className="rounded-[3px] px-0.5 box-decoration-clone" style={wash(p.hl)}>
                  {p.text}
                </span>
              </p>
            </div>
          ))}
        </div>
        {/* Threads (desktop): from each card's foot to the note's head */}
        <svg
          viewBox="0 0 300 60"
          preserveAspectRatio="none"
          className="hidden h-16 w-full overflow-visible sm:block"
        >
          {[
            "M 50 2 C 52 30, 120 28, 146 58",
            "M 150 2 C 148 22, 152 38, 150 58",
            "M 250 2 C 247 30, 180 30, 154 58",
          ].map((d) => (
            <path
              key={d}
              d={d}
              fill="none"
              stroke={NOTE_INK}
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeDasharray="1 5"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
        <div className="mx-auto mt-3 max-w-sm rounded-lg border border-primary/40 bg-card p-5 shadow-[0_18px_40px_-28px_oklch(0.3_0.02_80/45%)] sm:mt-0">
          <p className="eyebrow">{t("landing.mock.noteLabel")}</p>
          <p className="mt-1 font-serif text-reading font-medium">{t("landing.mock.noteTitle")}</p>
          <p className="mt-1 text-control leading-relaxed text-muted-foreground">
            {t("landing.mock.noteBody")}
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {[t("landing.mock.topic1"), t("landing.mock.topic2")].map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-secondary px-2 py-0.5 text-meta text-secondary-foreground"
              >
                #{tag}
              </span>
            ))}
          </div>
        </div>
      </div>
      <figcaption className="mt-5 text-center text-control text-muted-foreground">
        {t("landing.vis.diagramCaption")}
      </figcaption>
    </figure>
  );
}

/** The four looks, each a real token subtree (force-light / dark / clean). */
export function LooksRow() {
  const { t } = useTranslation();
  const looks = [
    { cls: cn("force-light", PAPER_FONT), style: t("readerStyle.paper"), theme: t("theme.light") },
    { cls: cn("dark", PAPER_FONT), style: t("readerStyle.paper"), theme: t("theme.dark") },
    { cls: "force-light style-clean", style: t("readerStyle.clean"), theme: t("theme.light") },
    { cls: "dark style-clean", style: t("readerStyle.clean"), theme: t("theme.dark") },
  ];
  return (
    <div className="grid grid-cols-2 gap-3">
      {looks.map((l) => (
        <figure key={l.cls} className="m-0">
          <div
            aria-hidden
            className={cn(
              l.cls,
              "rounded-lg border border-border bg-background p-4 text-foreground shadow-sm",
            )}
          >
            <p className="font-serif text-phone font-medium">John 1</p>
            <p className="mt-2 font-serif text-list leading-relaxed">
              <sup className="mr-0.5 font-sans text-[0.65em] text-muted-foreground">1</sup>
              <span className="rounded-[2px] box-decoration-clone" style={wash("gold")}>
                In the beginning was the Word,
              </span>{" "}
              and the Word was with God, and the Word was God.
            </p>
          </div>
          <figcaption className="mt-1.5 text-center text-meta text-muted-foreground">
            {l.style} · {l.theme}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

/** A phone showing one column of the page, as the reader does on phones. */
export function PhoneMock() {
  const { t } = useTranslation();
  return (
    <figure className="m-0 flex flex-col items-center">
      <div
        aria-hidden
        className="w-56 rounded-[2.25rem] border-[6px] border-foreground/85 bg-background p-1 shadow-[0_24px_50px_-30px_oklch(0.3_0.02_80/50%)]"
      >
        <div className="mx-auto mt-1 h-1.5 w-14 rounded-full bg-foreground/20" />
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-meta font-semibold text-primary">biblestdy</span>
            <span className="font-mono text-meta text-muted-foreground">WEB</span>
          </div>
          <p className="mt-4 font-serif text-title font-medium">John 1</p>
          <p className="mt-2 font-serif text-control leading-[1.8]">
            <sup className="mr-0.5 font-sans text-[0.65em] text-muted-foreground">4</sup>
            In him was life, and{" "}
            <span className="rounded-[2px] box-decoration-clone" style={wash("amber")}>
              the life was the light of men.
            </span>{" "}
            <sup className="mr-0.5 font-sans text-[0.65em] text-muted-foreground">5</sup>
            The light shines in the darkness, and the darkness hasn’t overcome it.
          </p>
          <div className="mt-5 flex items-center justify-between border-t border-border pt-2 text-muted-foreground">
            <ChevronLeft className="size-4" />
            <span className="font-mono text-meta">1 / 4</span>
            <ChevronRight className="size-4" />
          </div>
        </div>
      </div>
      <figcaption className="mt-3 text-center text-meta text-muted-foreground">
        {t("landing.vis.phoneCaption")}
      </figcaption>
    </figure>
  );
}
