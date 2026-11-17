import type { Annotation, Highlight, MarkLink, NoteRef, ScriptureRef, Translation } from "@biblestdy/shared";
import { localRef } from "@biblestdy/shared/versification";
import { skipToken, useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { markKindOf, type MarkKind } from "../notes/page-marks";
import type { PagePlace } from "./ref-context";
import { useKindName } from "./use-page-marks";

/**
 * A ref tagged with a mark (#216) — a live link — as the note shows it.
 * Ruth's condition: when it can't follow the mark it says so, never
 * silently:
 * - `live`: the mark is on the open page; its kind as it is now (a
 *   recolour follows).
 * - `here`: the server has it in the reading translation, on a chapter not
 *   open beside the note: nothing to say.
 * - `elsewhere`: it lives in another translation — "Marked in WEB"; the
 *   reader shows the whole verse.
 * - `removed`: erased (or never the reader's) — "Mark removed"; the whole
 *   verse. An undo of the erase brings it back to `live`.
 * Pure; ref-mark.test.ts.
 */
export type RefMarkState =
  | { state: "live"; kind: MarkKind }
  | { state: "here" }
  | { state: "elsewhere"; translationId: string }
  | { state: "removed" };

export function refMarkState(
  mark: MarkLink,
  {
    live,
    onPage,
    server,
    readingId,
  }: {
    /** The mark among the open page's marks (by kind and id), if there. */
    live: Highlight | Annotation | undefined;
    /** The open page's marks are loaded and cover the ref's chapter. */
    onPage: boolean;
    /** The ref's mark as the server last saw it (absent: not saved yet). */
    server: NoteRef["mark"] | undefined;
    readingId: string | undefined;
  },
): RefMarkState {
  if (live) return { state: "live", kind: markKindOf(live) };
  const home = server?.translationId;
  if (home && home !== readingId) return { state: "elsewhere", translationId: home };
  // Not on the open page: trust the server (no word on it yet: say nothing)
  if (!onPage && (home || !server)) return { state: "here" };
  return { state: "removed" };
}

/**
 * Each tagged ref's state, beside the reader: the open page's marks from
 * the reader's own caches (by key — never fetched here, as usePageMarks),
 * the server's word from the note's saved refs.
 */
export function useRefMarkState(page: PagePlace | undefined, saved: readonly NoteRef[] | undefined, readingId: string | undefined) {
  const tid = page?.translationId ?? "";
  const book = page?.book ?? "";
  const ch = page?.chapter ?? 0;
  const highlights = useQuery<Highlight[]>({ queryKey: ["highlights", tid, book, ch], queryFn: skipToken }).data;
  const annotations = useQuery<Annotation[]>({ queryKey: ["annotations", tid, book, ch], queryFn: skipToken }).data;
  const translations = useQuery<Translation[]>({ queryKey: ["translations"], queryFn: skipToken }).data;
  const abbr = translations?.find((tr) => tr.id === tid)?.abbreviation;
  return useCallback(
    (ref: ScriptureRef, mark: MarkLink): RefMarkState => {
      const list: readonly (Highlight | Annotation)[] | undefined = mark.kind === "highlight" ? highlights : annotations;
      const live = list?.find((m) => m.id === mark.id);
      // The ref's chapter here, in the page's own numbering
      const at = abbr ? (localRef(ref, abbr)?.ref ?? null) : ref;
      const onPage = !!page && !!list && !!at && at.book === book && at.chapter === ch;
      const server = saved?.find((r) => r.mark?.id === mark.id)?.mark;
      return refMarkState(mark, { live, onPage, server, readingId: readingId ?? page?.translationId });
    },
    [highlights, annotations, abbr, page, book, ch, saved, readingId],
  );
}

/** A tagged ref's state in words (#216): its kind live ("Highlight
 * (gold)"), else why it can't follow ("Mark removed", "Marked in WEB");
 * nothing while it is simply off the open page. */
export function useMarkStateWords() {
  const { t } = useTranslation();
  const kindName = useKindName();
  const translations = useQuery<Translation[]>({ queryKey: ["translations"], queryFn: skipToken }).data;
  return (s: RefMarkState): string =>
    s.state === "live"
      ? kindName(s.kind)
      : s.state === "removed"
        ? t("note.markRemoved")
        : s.state === "elsewhere"
          ? t("note.markedIn", { abbr: translations?.find((tr) => tr.id === s.translationId)?.abbreviation ?? s.translationId })
          : "";
}
