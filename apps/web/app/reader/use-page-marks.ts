import type { Annotation, Chapter, Highlight } from "@biblestdy/shared";
import { canonicalRef } from "@biblestdy/shared/versification";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useContext, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useColorName } from "~/lib/highlight-labels";
import { pageMarks, type MarkKind, type PageMark } from "../notes/page-marks";
import { useTranslations } from "./localizer";
import { ScriptureRefContext } from "./ref-context";
import { annotationsQuery } from "./use-annotations";
import { highlightsQuery } from "./use-highlights";

/**
 * The open chapter's marks for the note's `@` menu and "+ Verse" (#191) —
 * from the reader's own caches (loaded already; never refetched here). Off
 * the reader: none.
 */
export function usePageMarks(): PageMark[] {
  const { page } = useContext(ScriptureRefContext);
  const tid = page?.translationId ?? "";
  const book = page?.book ?? "";
  const ch = page?.chapter ?? 0;
  const opts = { enabled: !!page, staleTime: Infinity, refetchOnMount: false } as const;
  const highlights = useQuery({ ...highlightsQuery(tid, book, ch), ...opts }).data;
  const annotations = useQuery({ ...annotationsQuery(tid, book, ch), ...opts }).data;
  const chapter = useQuery<Chapter>({ queryKey: ["chapter", tid, book, ch], enabled: false }).data;
  const { data: translations } = useTranslations();
  const abbr = translations?.find((tr) => tr.id === tid)?.abbreviation ?? "";
  return useMemo(
    () => (page ? pageMarks(highlights ?? EMPTY_H, annotations ?? EMPTY_A, chapter, (r) => canonicalRef(r, abbr)) : []),
    [page, highlights, annotations, chapter, abbr],
  );
}
const EMPTY_H: Highlight[] = [];
const EMPTY_A: Annotation[] = [];

/** How a mark is marked, in words: "Highlight (gold)", "Underline, with text". */
export function useMarkKind() {
  const { t } = useTranslation();
  const { name } = useColorName();
  const one = useCallback(
    (k: MarkKind) =>
      k.type === "highlight"
        ? t("note.markHighlight", { color: name(k.color) })
        : `${t(k.mark ? `marks.${k.mark}` : "marks.label")}${k.text ? `, ${t("marks.text").toLocaleLowerCase()}` : ""}`,
    [t, name],
  );
  return useCallback((m: PageMark) => m.kinds.map(one).join(" · "), [one]);
}
