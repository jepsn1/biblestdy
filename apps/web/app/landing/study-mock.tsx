import { useTranslation } from "react-i18next";
import { HIGHLIGHT_BG, NOTE_INK, NOTE_INK_TEXT } from "~/reader/highlight-colors";
import { scribblePath } from "~/reader/scribble";

/** Static picture of the study surface for the landing page: a page of
 * Scripture with a marker highlight, a pen circle + margin scribble, and the
 * note that belongs to it. Real reader tokens + the real scribble geometry,
 * no data. Scripture is the World English Bible (public domain) in every UI
 * language; only the reader's own notes are localized. Decorative — the
 * page copy says the same in words, so it's hidden from screen readers.
 * Inks itself once on load (app.css landing-*; static under reduced motion). */

const LOOP = scribblePath(0, 0, 100, 20, "landing-eternal-life");

export function StudyMock() {
  const { t } = useTranslation();

  return (
    <div
      aria-hidden
      className="mx-auto max-w-4xl overflow-hidden rounded-xl border border-border bg-background shadow-[0_24px_60px_-30px_oklch(0.3_0.02_80/35%)] select-none"
    >
      {/* Reader chrome */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <span className="font-mono text-meta font-semibold text-primary">biblestdy</span>
        <span className="font-mono text-meta text-muted-foreground">John 3 · WEB</span>
        <span className="flex gap-1.5">
          <span className="size-2 rounded-full bg-muted-foreground/30" />
          <span className="size-2 rounded-full bg-muted-foreground/30" />
        </span>
      </div>

      <div className="grid sm:grid-cols-[1fr_17rem]">
        {/* The page */}
        <div className="grid grid-cols-[1fr] gap-6 px-6 py-8 sm:grid-cols-[1fr_8.5rem] sm:px-10">
          <div className="font-serif text-reading leading-[1.9] text-foreground">
            <h3 className="mb-4 font-serif text-title font-medium">John 3</h3>
            <p>
              <Sup n={14} />
              As Moses lifted up the serpent in the wilderness, even so must the Son of Man be
              lifted up, <Sup n={15} />
              that whoever believes in him should not perish, but have eternal life.{" "}
              <Sup n={16} />
              <span
                className="landing-hl rounded-[3px] px-0.5 box-decoration-clone"
                style={{
                  backgroundImage: `linear-gradient(${HIGHLIGHT_BG.gold}, ${HIGHLIGHT_BG.gold})`,
                }}
              >
                For God so loved the world, that he gave his only born Son,
              </span>{" "}
              that whoever believes in him should not perish, but have{" "}
              <span className="relative inline-block">
                eternal life.
                <svg
                  viewBox="0 0 100 20"
                  preserveAspectRatio="none"
                  className="pointer-events-none absolute inset-0 size-full overflow-visible"
                >
                  <path
                    d={LOOP}
                    pathLength={1}
                    className="landing-ink"
                    fill="none"
                    stroke={NOTE_INK}
                    strokeWidth={1.6}
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              </span>{" "}
              <Sup n={17} />
              For God didn’t send his Son into the world to judge the world, but that the world
              should be saved through him.
            </p>
          </div>

          {/* Margin scribble */}
          <div className="hidden sm:block">
            <p
              className="landing-late mt-52 -rotate-2 font-serif text-list leading-snug italic"
              style={{ color: NOTE_INK_TEXT }}
            >
              {t("landing.mock.margin")}
            </p>
          </div>
        </div>

        {/* The note beside it */}
        <div className="landing-later border-t border-border bg-card px-5 py-6 sm:border-t-0 sm:border-l">
          <p className="eyebrow">{t("landing.mock.noteLabel")}</p>
          <h4 className="mt-2 font-serif text-reading font-medium">{t("landing.mock.noteTitle")}</h4>
          <p className="mt-2 text-list leading-relaxed text-muted-foreground">
            {t("landing.mock.noteBody")}
          </p>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {["John 3:16", "Rom 5:8", "1 John 4:9"].map((ref) => (
              <span
                key={ref}
                className="rounded-full border border-border bg-background px-2 py-0.5 font-mono text-meta text-muted-foreground"
              >
                {ref}
              </span>
            ))}
          </div>
          <div className="mt-5 border-t border-border pt-4">
            <p className="eyebrow">{t("landing.mock.topicsLabel")}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
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
      </div>
    </div>
  );
}

function Sup({ n }: { n: number }) {
  return (
    <sup className="mr-1 font-sans text-[0.6em] font-semibold text-muted-foreground">{n}</sup>
  );
}
