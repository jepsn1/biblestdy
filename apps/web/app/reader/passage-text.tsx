import type { Chapter } from "@biblestdy/shared";
import { Fragment, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { showVerses } from "~/lib/print-limit";
import { passageLines } from "./chapter-layout";

/**
 * A passage as the reader sets it, outside the page (Compare translations,
 * #167): paragraphs and poetry lines with the reader's hanging indents,
 * verse numbers as in the reader (bridges "14–15"), in the reader's face,
 * size and leading. No headings, footnotes, highlights or margin marks, and
 * no measuring — plain flow. Never imports chapter-text.
 */
export function PassageText({
  parts,
  language,
  numberSep,
}: {
  /** Whole verse units per chapter (stored numbers), in order. */
  parts: readonly { chapter: Chapter; from: number; to: number }[];
  /** The translation's language (BCP 47): the text is voiced in it. */
  language: string;
  /** "3:16" / "3,16": a chapter change inside the passage prints "4:1". */
  numberSep: string;
}) {
  const { t, i18n } = useTranslation();
  // The print limit counts what this shows (lib/print-limit)
  const count = parts.reduce((n, p) => n + p.chapter.verses.filter((v) => v.verse >= p.from && v.verse <= p.to).length, 0);
  useEffect(() => showVerses(count), [count]);

  return (
    <div data-scripture lang={language} className="max-w-[62ch] font-serif text-reading leading-[1.6] text-foreground">
      {parts.map((part, pi) => {
        const newChapter = pi > 0 && parts[pi - 1].chapter.chapter !== part.chapter.chapter;
        return passageLines(part.chapter, { from: part.from, to: part.to }).map((block, bi) => (
          <p
            key={`${pi}:${bi}`}
            data-block={block.kind}
            className={block.stanza || (bi === 0 && pi > 0) ? "mt-[0.85em]" : undefined}
            style={
              block.kind === "poetry"
                ? { paddingLeft: `${block.level + 2}em`, textIndent: "-2em" }
                : block.kind === "paragraph" && !block.opening && !(bi === 0 && pi === 0)
                  ? { textIndent: "1em" }
                  : undefined
            }
          >
            {block.pieces.map((piece, i) => {
              const v = piece.verse;
              const printed = v.label ?? String(v.verse);
              // A quote opens flush, like the start of a page
              const first = bi === 0 && i === 0;
              const label = newChapter && first ? `${part.chapter.chapter}${numberSep}${printed}` : printed;
              const bridge = v.label ? /^(\d+)\D+(\d+)$/.exec(v.label) : null;
              return (
                <Fragment key={`${v.verse}:${piece.words[0]?.i ?? 0}`}>
                  {piece.showNumber && (
                    <>
                      <sup
                        aria-hidden
                        className="mr-1 align-[0.5em] font-sans text-[0.58em] leading-[0] font-medium text-muted-foreground tabular-nums"
                      >
                        {label}
                      </sup>
                      <span className="sr-only" lang={i18n.language}>
                        {bridge
                          ? t("compare.verses", { from: bridge[1], to: bridge[2] })
                          : t("compare.verse", { n: newChapter && first ? label : v.verse })}{" "}
                      </span>
                    </>
                  )}
                  {piece.words.map((w) => w.text + (w.cut ? "" : " ")).join("")}
                </Fragment>
              );
            })}
          </p>
        ));
      })}
    </div>
  );
}
