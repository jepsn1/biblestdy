import { useEffect, useState } from "react";
import { lazyModule, useLazyModule } from "~/lib/lazy-module";
import { REPLAY_TOURS, tourDue, tourHostMounted, type TourId } from "./tour-state";

/** The tours' chunk (notes-tour.tsx): fetched only when one is due. */
const tours = lazyModule(() => import("./notes-tour"));

/** Due (or asked for again from Settings / the palette) while mounted. */
function useTourWanted(id: TourId, enabled: boolean) {
  const [want, setWant] = useState(() => tourDue(id));
  const [replays, setReplays] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const unmount = tourHostMounted();
    const replay = () => {
      setWant(true);
      setReplays((n) => n + 1);
    };
    window.addEventListener(REPLAY_TOURS, replay);
    return () => {
      unmount();
      window.removeEventListener(REPLAY_TOURS, replay);
    };
  }, [enabled]);
  const on = want && enabled;
  const { value } = useLazyModule(tours, on);
  return { mod: on ? value : undefined, replays, end: () => setWant(false) };
}

/** In every open note (reader panel, Notes page): the note tour (#162). */
export function NoteTourHost({ root, body }: { root: () => HTMLElement | null; body: string }) {
  const { mod, replays, end } = useTourWanted("note", true);
  return mod ? <mod.NoteTour key={replays} root={root} body={body} replay={replays > 0} onEnd={end} /> : null;
}

/** On the Notes page while no note is open: its own tour (#162). */
export function NotesTourHost({ root, enabled }: { root: () => HTMLElement | null; enabled: boolean }) {
  const { mod, replays, end } = useTourWanted("notes", enabled);
  return mod ? <mod.NotesPageTour key={replays} root={root} replay={replays > 0} onEnd={end} /> : null;
}
