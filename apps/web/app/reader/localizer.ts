import type { ScriptureRef, Translation } from "@biblestdy/shared";
import type { LocalRef } from "@biblestdy/shared/versification";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { api } from "~/lib/query";
import { lazyModule, useLazyModule } from "~/lib/lazy-module";

/**
 * Stored references in the reading translation's numbering (#163): note
 * refs are canonical (English) numbers, anchors their own translation's,
 * and BPH numbers the Old Testament the Hebrew way (English Mal 4:5 is BPH
 * Mal 3,23). The map (#166) is a lazy chunk — kept out of /read's first
 * load — so what needs it waits for it: a verse-level mark appears a moment
 * late rather than on a wrong verse.
 */

type Versification = typeof import("@biblestdy/shared/versification");

export const versification = lazyModule<Versification>(() => import("@biblestdy/shared/versification"));

export interface Localizer {
  /** The reading translation's abbreviation ("" = unknown: English). */
  abbr: string;
  /** A stored (canonical) ref here; null = no counterpart. */
  local(ref: ScriptureRef): LocalRef | null;
  /** Another translation's own numbers (an anchor made there) here. */
  fromTranslation(ref: ScriptureRef, translationId: string): LocalRef | null;
  /** Numbers of `translationId` (default: the reading one) → canonical,
   * for a `bible:` href; null = no counterpart (a psalm title alone). */
  canonical(ref: ScriptureRef, translationId?: string): ScriptureRef | null;
}

/** Pure: the map + the translation list + what is being read. */
export function makeLocalizer(vz: Pick<Versification, "localRef" | "canonicalRef">, translations: readonly Translation[], readingId: string): Localizer {
  const abbrOf = (id: string) => translations.find((t) => t.id === id)?.abbreviation ?? "";
  const abbr = abbrOf(readingId);
  return {
    abbr,
    local: (ref) => vz.localRef(ref, abbr),
    fromTranslation: (ref, id) => (id === readingId ? { ref, renumbered: false } : vz.localRef(ref, abbr, abbrOf(id))),
    canonical: (ref, id = readingId) => vz.canonicalRef(ref, abbrOf(id)),
  };
}

/** The translations list (shared cache with the nav and the chooser). */
export function useTranslations() {
  return useQuery({
    queryKey: ["translations"],
    queryFn: () => api<Translation[]>("/api/translations"),
    staleTime: Infinity,
  });
}

/** The localizer for the reading translation, once the map and the list are
 * in — null meanwhile. `enabled: false` fetches nothing (a chapter without
 * refs or other translations' anchors never needs the map). */
export function useLocalizer(readingId: string | undefined, enabled = true): Localizer | null {
  const { value: vz } = useLazyModule(versification, enabled && !!readingId);
  const { data: translations } = useTranslations();
  return useMemo(
    () => (vz && translations && readingId ? makeLocalizer(vz, translations, readingId) : null),
    [vz, translations, readingId],
  );
}
