import { announce } from "~/lib/announce";
import i18n from "~/lib/i18n";
import "../locales/tour";
import { replayTours } from "./tour-memory";

/** Settings' and the palette's "Show the tour again" (#162): both tours
 * from the start — at once in an open note or on the Notes page, else a
 * word on when (read out, not shown, #257). Lives in their lazy chunks. */
export function showToursAgain() {
  if (!replayTours()) announce(i18n.t("tour.replayLater"));
}
