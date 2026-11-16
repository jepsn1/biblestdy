import { useEffect, useState } from "react";
import type { Button } from "~/components/ui/button";
import type { Popover, PopoverContent } from "~/components/ui/popover";
import { lazyModule, useLazyModule } from "~/lib/lazy-module";
import { type ReplayDetail, REPLAY_TOURS, tourDue, type TourId } from "./tour-state";

/**
 * The overlay pieces the tours' chunk borrows from the page (like the note
 * editor's EditorKit): a lazy chunk importing Base UI itself re-splits the
 * reader's first-paint chunks (+2 KB gz measured).
 */
export type TourKit = {
  Popover: typeof Popover;
  PopoverContent: typeof PopoverContent;
  Button: typeof Button;
};

/** The tours' chunk (notes-tour.tsx): fetched only when one is due. */
const tours = lazyModule(() => import("./notes-tour"));

/** Due (or asked for again from Settings / the palette) while mounted. */
function useTourWanted(id: TourId, enabled: boolean) {
  const [want, setWant] = useState(() => tourDue(id));
  const [replays, setReplays] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const replay = (e: Event) => {
      (e as CustomEvent<ReplayDetail>).detail.taken = true;
      setWant(true);
      setReplays((n) => n + 1);
    };
    window.addEventListener(REPLAY_TOURS, replay);
    return () => window.removeEventListener(REPLAY_TOURS, replay);
  }, [enabled]);
  const on = want && enabled;
  const { value } = useLazyModule(tours, on);
  return { mod: on ? value : undefined, replays, end: () => setWant(false) };
}

/** In every open note (reader panel, Notes page): the note tour (#162). */
export function NoteTourHost({ root, body, kit }: { root: () => HTMLElement | null; body: string; kit: TourKit }) {
  const { mod, replays, end } = useTourWanted("note", true);
  return mod ? <mod.NoteTour key={replays} root={root} body={body} kit={kit} replay={replays > 0} onEnd={end} /> : null;
}

/** On the Notes page while no note is open: its own tour (#162). */
export function NotesTourHost({ root, enabled, kit }: { root: () => HTMLElement | null; enabled: boolean; kit: TourKit }) {
  const { mod, replays, end } = useTourWanted("notes", enabled);
  return mod ? <mod.NotesPageTour key={replays} root={root} kit={kit} replay={replays > 0} onEnd={end} /> : null;
}
