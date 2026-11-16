import { useTranslation } from "react-i18next";
import type { Note } from "@biblestdy/shared";
import { ArrowRight, Plus } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { Link } from "react-router";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Button, buttonVariants } from "~/components/ui/button";
import { ListSkeleton } from "~/components/list-skeleton";
import { bookLocale, useBookName } from "~/lib/book-name";
import { cn, focusRing } from "~/lib/utils";
import { anchorLabel, compareAnchors, noteTitle } from "../notes/note-list";
import { PanelHeader, panelTitleClass } from "./panel-header";
import { useConnections } from "./use-connections";
import { useNoteActions } from "./use-notes";

/**
 * The reader's Notes panel (#9, reworked in the notes plan, Phase 1): one
 * question — "what have I written about this chapter?". The chapter's notes
 * in text order, each with where it sits here and where else it points; the
 * topics those notes carry; a way to start a note and a way to the Notes
 * page, where every note lives. (Recent notes and the "also points to" list
 * moved out: the Notes page sorts by last edit, and each row names its
 * other passages.)
 */
/** Marks the nav button that opens a side panel, so focus can return to it. */
export const PANEL_TOGGLE = "data-panel-toggle";

export function ConnectionsPanel({
  translationId,
  book,
  chapter,
  onOpenNote,
  onClose,
  mobile = false,
}: {
  translationId: string;
  book: string;
  chapter: number;
  onOpenNote: (id: string) => void;
  onClose: () => void;
  /** Drawer build (#13): touch-sized rows; the drawer owns focus. */
  mobile?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const headingId = useId();
  const nameOf = useBookName();
  const locale = bookLocale(i18n.language);
  const connections = useConnections(translationId, book, chapter, true);
  const { create } = useNoteActions();
  const asideRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Side panel (not a drawer) opened from its nav toggle: focus moves to the
  // panel heading; closing it hands focus back to the toggle (#62).
  useEffect(() => {
    if (mobile) return;
    if (document.activeElement?.closest(`[${PANEL_TOGGLE}="connections"]`)) {
      headingRef.current?.focus();
    }
    const aside = asideRef.current;
    // Esc closes the side panel while focus is in it (drawers handle Esc themselves)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) onCloseRef.current();
    };
    aside?.addEventListener("keydown", onKey);
    return () => {
      aside?.removeEventListener("keydown", onKey);
      if (aside?.contains(document.activeElement) || document.activeElement === document.body) {
        document.querySelector<HTMLElement>(`[${PANEL_TOGGLE}="connections"]`)?.focus();
      }
    };
  }, [mobile]);

  const inChapter = (a: Note["anchors"][number]) =>
    a.translationId === translationId && a.book === book && a.chapter === chapter;
  const here = `${nameOf(book)} ${chapter}`;
  // The API lists notes from every translation and inline refs (#158); until
  // the reader can show those (#159), keep to notes anchored here in this one
  const notesHere = connections?.notesHere.filter((n) => n.anchors.some(inChapter)) ?? [];

  /** A blank note beside the text — passages are added by typing them in
   * its references, or by selecting words. */
  async function newNote() {
    const created = await create();
    if (created) onOpenNote(created.id);
  }

  return (
    <aside
      ref={asideRef}
      aria-labelledby={headingId}
      className="flex h-full w-full flex-col bg-background"
    >
      <PanelHeader onClose={onClose} closeLabel={t("connections.close")}>
        <h2 id={headingId} ref={headingRef} tabIndex={-1} data-panel-focus className={`${panelTitleClass} outline-none`}>
          {t("connections.title")}
        </h2>
      </PanelHeader>

      <ScrollArea className="min-h-0 flex-1">
        {!connections && <ListSkeleton sections={[3]} className="p-2 pt-3" />}
        {connections && (
          <div className="flex flex-col gap-5 p-2 pt-3">
            <section aria-labelledby={`${headingId}-here`}>
              <h3 id={`${headingId}-here`} className="eyebrow px-2 pb-1">
                {t("connections.inChapter", { ref: here })}
              </h3>
              {notesHere.length === 0 && (
                <p className="px-2 font-serif text-control text-muted-foreground italic">
                  {t("connections.emptyHere")}
                </p>
              )}
              <ul className="flex flex-col">
                {notesHere.map((n) => {
                  const own = [...n.anchors].sort(compareAnchors);
                  const mine = own.filter(inChapter);
                  const elsewhere = own.filter((a) => !inChapter(a));
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => onOpenNote(n.id)}
                        className={cn("w-full rounded px-2 text-left hover:bg-accent", mobile ? "py-2.5" : "py-1.5", focusRing)}
                      >
                        <span className="block truncate font-serif text-control">{noteTitle(n, t("note.untitled"))}</span>
                        <span className="block truncate text-meta tabular-nums text-primary">
                          {mine.map((a) => anchorLabel(a, nameOf, locale)).join(" · ")}
                        </span>
                        {elsewhere.length > 0 && (
                          <span className="block truncate text-meta text-muted-foreground">
                            {t("connections.alsoIn")}{" "}
                            {elsewhere.map((a) => anchorLabel(a, nameOf, locale)).join(" · ")}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>

            {connections.topics.length > 0 && (
              <section aria-labelledby={`${headingId}-topics`}>
                <h3 id={`${headingId}-topics`} className="eyebrow px-2 pb-1">
                  {t("connections.topics")}
                </h3>
                {/* Topics of the notes here (and older chapter topics), as
                    links to the Notes page filtered by each */}
                <ul className="flex flex-wrap gap-1.5 px-2">
                  {connections.topics.map((tp) => (
                    <li key={tp.id}>
                      <Link
                        to={`/notes?topic=${encodeURIComponent(tp.name)}`}
                        className={cn(
                          "inline-flex items-center rounded-full border border-border bg-muted/50 px-2.5 text-meta text-muted-foreground hover:text-primary",
                          mobile ? "py-1.5" : "py-0.5",
                          focusRing,
                        )}
                      >
                        {tp.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </ScrollArea>

      <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-2 py-1.5">
        <Button variant="ghost" size="sm" className="max-sm:h-10" onClick={() => void newNote()}>
          <Plus aria-hidden />
          {t("connections.newNote")}
        </Button>
        <Link to="/notes" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-muted-foreground max-sm:h-10")}>
          {t("connections.allNotes")}
          <ArrowRight aria-hidden />
        </Link>
      </footer>
    </aside>
  );
}
