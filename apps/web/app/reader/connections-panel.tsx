import { useTranslation } from "react-i18next";
import type { Note } from "@biblestdy/shared";
import { anchorReference, formatReference } from "@biblestdy/shared";
import { useEffect, useId, useRef } from "react";
import { useNavigate } from "react-router";
import { ScrollArea } from "~/components/ui/scroll-area";
import { PanelHeader, panelTitleClass } from "./panel-header";
import { TagChips } from "./tag-chips";
import { useConnections } from "./use-connections";
import { usePassageTags } from "./use-tags";

/**
 * The connections panel (issue #9) — resurfacing at the point of reading:
 * notes anchored in this chapter, the passages they also anchor to
 * ("also appears in"), and the most recent notes as re-entry into study.
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
  const { t } = useTranslation();
  const headingId = useId();
  const navigate = useNavigate();
  const connections = useConnections(translationId, book, chapter, true);
  const passageTags = usePassageTags(translationId, book, chapter);
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

  /** A note anchored here opens in place; one from elsewhere is read there,
   * arriving with its panel open (?note= survives navigation). */
  function openNote(note: Note) {
    const here = note.anchors.some(
      (a) => a.translationId === translationId && a.book === book && a.chapter === chapter,
    );
    if (here) {
      onOpenNote(note.id);
      return;
    }
    const a = note.anchors[0];
    if (a) navigate(`/read/${a.book}/${a.chapter}?note=${note.id}`);
  }

  function NoteRow({ note }: { note: Note }) {
    return (
      <button
        type="button"
        onClick={() => openNote(note)}
        className={`w-full rounded px-2 text-left hover:bg-accent ${mobile ? "py-2.5" : "py-1.5"}`}
      >
        <span className="block truncate font-serif text-sm">
          {note.title || t("note.untitled")}
        </span>
        <span className="block truncate font-mono text-xs text-muted-foreground">
          {note.anchors.map((a) => formatReference(anchorReference(a))).join(" · ")}
        </span>
      </button>
    );
  }

  function SectionTitle({ children }: { children: string }) {
    return (
      <h3 className="px-2 pb-1 font-sans text-xs font-semibold tracking-widest text-primary uppercase">
        {children}
      </h3>
    );
  }

  return (
    <aside
      ref={asideRef}
      aria-labelledby={headingId}
      className="flex h-full w-full flex-col bg-background"
    >
      <PanelHeader onClose={onClose} closeLabel={t("connections.close")}>
        <h2 id={headingId} ref={headingRef} tabIndex={-1} className={`${panelTitleClass} outline-none`}>
          {t("connections.title")}
        </h2>
      </PanelHeader>

      <ScrollArea className="min-h-0 flex-1">
        {connections && (
          <div className="flex flex-col gap-5 p-2 pt-3">
            <section>
              <SectionTitle>{t("connections.topics")}</SectionTitle>
              {/* Union of this chapter's tags and its notes' tags; only tags
                  ON the passage are removable here — note tags live with the
                  note. Adding always tags the passage. */}
              <div className="px-2">
                <TagChips
                  tags={connections.topics.filter((tp) => tp.onPassage)}
                  onAdd={(name) => void passageTags.add(name)}
                  onRemove={(tp) => void passageTags.remove(tp.id)}
                  addLabel={t("connections.tagPassage")}
                />
                {connections.topics.some((tp) => !tp.onPassage) && (
                  <div className="mt-1.5">
                    <span className="font-mono text-xs text-muted-foreground">
                      {t("connections.viaNotes")}{" "}
                    </span>
                    {connections.topics
                      .filter((tp) => !tp.onPassage)
                      .map((tp, i, arr) => (
                        <button
                          key={tp.id}
                          type="button"
                          onClick={() => navigate(`/topic/${encodeURIComponent(tp.name)}`)}
                          className="font-mono text-xs text-muted-foreground underline-offset-2 hover:text-primary hover:underline"
                        >
                          {tp.name}
                          {i < arr.length - 1 ? ", " : ""}
                        </button>
                      ))}
                  </div>
                )}
              </div>
            </section>

            <section>
              <SectionTitle>{t("connections.anchoredHere")}</SectionTitle>
              {connections.notesHere.length === 0 && (
                <p className="px-2 font-serif text-xs text-muted-foreground italic">
                  {t("connections.emptyAnchored")}
                </p>
              )}
              {connections.notesHere.map((n) => (
                <NoteRow key={n.id} note={n} />
              ))}
            </section>

            <section>
              <SectionTitle>{t("connections.alsoAppearsIn")}</SectionTitle>
              {connections.alsoAppearsIn.length === 0 && (
                <p className="px-2 font-serif text-xs text-muted-foreground italic">
                  {t("connections.emptyShared")}
                </p>
              )}
              {connections.alsoAppearsIn.map((p) => (
                <button
                  key={`${p.translationId}/${p.book}.${p.chapter}`}
                  type="button"
                  onClick={() => navigate(`/read/${p.book}/${p.chapter}`)}
                  className={`w-full rounded px-2 text-left hover:bg-accent ${mobile ? "py-2.5" : "py-1.5"}`}
                >
                  <span className="block font-serif text-sm">
                    {formatReference({ book: p.book, chapter: p.chapter })}
                  </span>
                  <span className="block truncate font-mono text-xs text-muted-foreground">
                    {t("connections.via")} {p.notes.map((n) => n.title || t("note.untitled")).join(", ")}
                  </span>
                </button>
              ))}
            </section>

            <section>
              <SectionTitle>{t("connections.recent")}</SectionTitle>
              {connections.recent.length === 0 && (
                <p className="px-2 font-serif text-xs text-muted-foreground italic">
                  {t("connections.emptyRecent")}
                </p>
              )}
              {connections.recent.map((n) => (
                <NoteRow key={n.id} note={n} />
              ))}
            </section>
          </div>
        )}
      </ScrollArea>
    </aside>
  );
}
