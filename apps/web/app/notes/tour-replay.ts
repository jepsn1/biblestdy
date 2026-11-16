import { toast } from "sonner";
import i18n from "~/lib/i18n";
import "../locales/tour";
import { replayTours } from "./tour-state";

/** Settings' and the palette's "Show the tour again" (#162): both tours
 * from the start — at once in an open note or on the Notes page, else a
 * word on when. Lives in their lazy chunks. */
export function showToursAgain() {
  if (!replayTours()) toast(i18n.t("tour.replayLater"));
}
