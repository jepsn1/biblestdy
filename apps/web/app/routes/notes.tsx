import { useTranslation } from "react-i18next";
import { formatScriptureHref, type Note, type NoteAnchor, type Tag } from "@biblestdy/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BookOpen, Plus, Search, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { ListSkeleton } from "~/components/list-skeleton";
import { Button, buttonVariants } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { useIsMobile } from "~/hooks/use-mobile";
import { bookLocale, useBookName } from "~/lib/book-name";
import { notifyError, notifyUndo } from "~/lib/notify";
import i18n from "~/lib/i18n";
import { api } from "~/lib/query";
import { loadReaderStyle } from "~/lib/reader-style";
import { loadTextSize } from "~/lib/text-size";
import { pathOf, requireAuth } from "~/lib/require-auth";
import { cn, focusRing } from "~/lib/utils";
import { zoomLockHandle } from "~/lib/viewport";
import { filterNotes, keepOrder, noteRefLabels, noteTitle, referenceLabel, type NoteSort } from "../notes/note-list";
import { readHref } from "../notes/verse-resolver";
import { readingHref, readingPlace } from "../reader/chapter-nav";
import { NotePanel, TOUR_KIT } from "../reader/note-panel";
import { noteEditor } from "../reader/note-editor-loader";
import { useAllNotesQuery, useNoteActions } from "../reader/use-notes";
import { NotesTourHost } from "../notes/tour-host";
import type { Route } from "./+types/notes";

// App route: zoom locked (#61) — the in-app Text size setting enlarges text
export const handle = zoomLockHandle;

export function meta() {
  return [{ title: `${i18n.t("notes.title")} — biblestdy` }];
}

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  // The Notes page is for editing: fetch the editor chunk (M8) alongside
  noteEditor.preload();
  const session = await requireAuth({ cached: true, next: pathOf(request.url) });
  await Promise.all([loadReaderStyle(session.user.id), loadTextSize(session.user.id)]);
  return null;
}

/** Sort choice is a per-device habit, like the panel width. */
const SORT_KEY = "notesSort";

/** "12. nov." / "Nov 12" — the day a note was last edited. */
function editedOn(iso: string, language: string): string {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(language, { day: "numeric", month: "short", year: sameYear ? undefined : "numeric" });
}

/**
 * The Notes page (notes plan, Phase 1): every note in one place — a list
 * (search, topic filter, last-edit or Bible order) beside the editor. The
 * same editor sits beside the text in the reader; here it stands alone, and
 * each reference reads in context. `/notes/:id` opens a note; `?topic=`
 * filters by a topic (topic chips everywhere link here). Phones show the
 * list and the editor as two screens.
 */
export default function NotesPage({ params }: Route.ComponentProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const nameOf = useBookName();
  const locale = bookLocale(i18n.language);
  const mobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const topic = searchParams.get("topic");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<NoteSort>(() =>
    typeof localStorage !== "undefined" && localStorage.getItem(SORT_KEY) === "bible" ? "bible" : "recent",
  );
  const { notes, loaded, fetching, failed, retry } = useAllNotesQuery(true);
  const actions = useNoteActions();
  const { data: tags = [] } = useQuery({ queryKey: ["tags"], queryFn: () => api<Tag[]>("/api/tags") });
  const searchId = useId();
  const listHeadingId = useId();
  const sortId = useId();
  const tourRoot = useCallback(() => document.querySelector<HTMLElement>("main"), []);

  const filtered = filterNotes(notes, { query, topic, sort, bookName: nameOf, locale });
  // The order freezes per view (open note, filter, sort): editing a note
  // bumps its last edit, but its row must not jump while you type. Leaving
  // the note (or changing the view) re-sorts.
  const viewKey = `${params.id ?? ""}|${query}|${topic ?? ""}|${sort}|${loaded}`;
  const [frozen, setFrozen] = useState(() => ({ key: viewKey, ids: filtered.map((n) => n.id) }));
  if (frozen.key !== viewKey) setFrozen({ key: viewKey, ids: filtered.map((n) => n.id) });
  const shown = frozen.key === viewKey ? keepOrder(filtered, frozen.ids) : filtered;
  const open = params.id ? notes.find((n) => n.id === params.id) : undefined;
  const back = readingHref();
  // The way back names the place (#148): "← Back to Psalm 23", on the page
  // last read (lastRead keeps it across reloads); "Bible" before any
  const backPlace = readingPlace();
  const backRef = backPlace && referenceLabel({ book: backPlace.book, chapter: backPlace.chapter }, nameOf, locale);
  // Keeps ?topic= while moving between notes
  const hrefOf = (id?: string) => `/notes${id ? `/${id}` : ""}${topic ? `?topic=${encodeURIComponent(topic)}` : ""}`;

  function setTopic(name: string | null) {
    setSearchParams(
      (p) => {
        if (name) p.set("topic", name);
        else p.delete("topic");
        return p;
      },
      { replace: true },
    );
  }

  async function newNote() {
    const created = await actions.create();
    if (created) navigate(hrefOf(created.id));
  }

  /** A reference reads in context: the reader opens there with the note
   * beside the text and the span selected. */
  function readAnchor(note: Note, a: NoteAnchor) {
    // ?v lands on the verse's page at once (also when the mark can't be
    // drawn, e.g. a reference made in another translation); ?mark selects it
    navigate(`/read/${a.book}/${a.chapter}?v=${a.startVerse}&note=${note.id}&mark=${encodeURIComponent(`note:${note.id}:${a.id}`)}`);
  }

  // The note open here was deleted (its undo toast is up): back to the list.
  // One that was never here (an old link, another account) says so instead.
  const [seenId, setSeenId] = useState<string | null>(null);
  if (open && seenId !== open.id) setSeenId(open.id);
  const gone = Boolean(params.id && loaded && !failed && !open);
  useEffect(() => {
    if (gone && seenId === params.id) navigate(hrefOf(), { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gone, seenId, params.id]);
  // …but only once a fresh list has landed: a note made a moment ago
  // (reader → "Open in Notes") isn't in the cached one yet. An id not in the
  // list gets one refetch of its own before it's called missing.
  const [checkedId, setCheckedId] = useState<string | null>(null);
  useEffect(() => {
    const id = params.id;
    if (!id || !gone || seenId === id || checkedId === id) return;
    void retry().then(() => setCheckedId(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gone, seenId, checkedId, params.id]);
  const missing = gone && !fetching && checkedId === params.id && seenId !== params.id;

  const listPane = (
    <section
      aria-labelledby={listHeadingId}
      className={cn(
        "flex min-h-0 min-w-0 flex-col border-border md:w-[22rem] md:shrink-0 md:border-r",
        params.id ? "max-md:hidden" : "max-md:flex-1",
      )}
    >
      <h2 id={listHeadingId} className="sr-only">
        {t("notes.listLabel")}
      </h2>
      <div className="flex shrink-0 flex-col gap-2 border-b border-border p-3">
        <div className="relative" data-tour="notes-search">
          <label htmlFor={searchId} className="sr-only">
            {t("notes.search")}
          </label>
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id={searchId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("notes.searchPlaceholder")}
            autoComplete="off"
            className="h-10 pl-8 md:h-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={topic ?? ""} onValueChange={(v) => setTopic(v ? String(v) : null)}>
            <SelectTrigger aria-label={t("notes.topicFilter")} size="sm" className="max-w-[12rem] max-md:h-10">
              <SelectValue placeholder={t("notes.allTopics")}>{topic ?? t("notes.allTopics")}</SelectValue>
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false} align="start">
              <SelectItem value="">{t("notes.allTopics")}</SelectItem>
              {tags.map((tg) => (
                <SelectItem key={tg.id} value={tg.name}>
                  {tg.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span id={sortId} className="sr-only">
            {t("notes.sortLabel")}
          </span>
          <ToggleGroup
            value={[sort]}
            onValueChange={(next) => {
              const picked = next[0] as NoteSort | undefined;
              if (!picked || picked === sort) return;
              setSort(picked);
              localStorage.setItem(SORT_KEY, picked);
            }}
            aria-labelledby={sortId}
            data-tour="notes-sort"
            spacing={1}
            className="rounded-lg bg-muted p-0.5"
          >
            {(["recent", "bible"] as const).map((v) => (
              <ToggleGroupItem
                key={v}
                value={v}
                size="sm"
                className="h-7 rounded-md px-2.5 text-meta font-normal text-muted-foreground hover:bg-background/60 hover:text-foreground aria-pressed:bg-background aria-pressed:font-medium aria-pressed:text-foreground aria-pressed:shadow-sm max-md:h-9"
              >
                {t(v === "recent" ? "notes.sortRecent" : "notes.sortBible")}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        {topic && <TopicChapters name={topic} onClear={() => setTopic(null)} />}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {!loaded ? (
          <ListSkeleton sections={[4]} className="p-2 pt-3" />
        ) : failed ? (
          <div role="alert" className="flex flex-col items-start gap-2 p-4">
            <p className="font-serif text-control text-muted-foreground italic">{t("notes.loadError")}</p>
            <Button variant="outline" size="sm" onClick={() => void retry()}>
              {t("note.retry")}
            </Button>
          </div>
        ) : notes.length === 0 ? (
          <div className="flex flex-col gap-3 p-4">
            <p className="font-serif text-control text-muted-foreground">{t("notes.emptyAll")}</p>
          </div>
        ) : shown.length === 0 ? (
          <p className="p-4 font-serif text-control text-muted-foreground italic">{t("notes.noMatches")}</p>
        ) : (
          <ul className="flex flex-col p-1.5" aria-labelledby={listHeadingId}>
            {shown.map((n) => {
              // In the text and marked in the Bible (#161: inline-only notes too)
              const refs = noteRefLabels(n, nameOf, locale);
              const current = n.id === params.id;
              return (
                <li key={n.id}>
                  <Link
                    to={hrefOf(n.id)}
                    aria-current={current ? "page" : undefined}
                    className={cn(
                      "block rounded-md px-2.5 py-2 hover:bg-accent/60 max-md:py-3",
                      current && "bg-accent",
                      focusRing,
                    )}
                  >
                    <span className="flex items-baseline gap-2">
                      <span className="min-w-0 flex-1 truncate font-serif text-control font-medium">
                        {noteTitle(n, t("note.untitled"))}
                      </span>
                      <span className={cn("shrink-0 text-meta tabular-nums", current ? "text-foreground" : "text-muted-foreground")}>{editedOn(n.updatedAt, i18n.language)}</span>
                    </span>
                    <span className={cn("block truncate text-meta tabular-nums", refs.length ? (current ? "text-foreground" : "text-primary") : current ? "text-foreground italic" : "text-muted-foreground italic")}>
                      {refs.length ? refs.join(" · ") : t("notes.noPassages")}
                    </span>
                    {(n.tags?.length ?? 0) > 0 && (
                      <span className={cn("block truncate text-meta", current ? "text-foreground" : "text-muted-foreground")}>
                        {n.tags?.map((tg) => tg.name).join(", ")}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </ScrollArea>
      <p className="sr-only" aria-live="polite">
        {loaded && !failed ? t("notes.count", { count: shown.length }) : ""}
      </p>
    </section>
  );

  const editorPane = (
    <section
      aria-label={open ? noteTitle(open, t("note.untitled")) : t("notes.editorLabel")}
      className={cn("flex min-h-0 min-w-0 flex-1 flex-col", !params.id && "max-md:hidden")}
    >
      {open ? (
        // A readable measure on wide screens, not a 1000px line
        <div className="flex min-h-0 w-full max-w-[52rem] flex-1 flex-col md:border-r md:border-border">
        <NotePanel
          key={open.id}
          note={open}
          page
          mobile={mobile}
          onEdit={actions.edit}
          onRemove={(id) => void actions.remove(id)}
          onDetach={actions.detach}
          onAttach={actions.attach}
          onShowAnchor={(a) => readAnchor(open, a)}
          onReadRef={(r, at, translationId) => {
            if (translationId) localStorage.setItem("translationId", translationId);
            // The reader's spotlight, as from the note beside the text (#210)
            navigate(readHref(at, open.id, formatScriptureHref(r) ?? undefined));
          }}
          spot={null}
          onClose={() => navigate(hrefOf())}
        />
        </div>
      ) : missing ? (
        <MissingNote backHref={hrefOf()} />
      ) : params.id ? (
        <ListSkeleton sections={[1]} className="p-4" />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="max-w-sm font-serif text-control text-muted-foreground">
            {notes.length ? t("notes.pickOne") : t("notes.emptyEditor")}
          </p>
          <Button variant="outline" onClick={() => void newNote()}>
            <Plus aria-hidden />
            {t("notes.new")}
          </Button>
        </div>
      )}
    </section>
  );

  return (
    // Safe areas (#251): the header clears the status bar, both panes a
    // landscape notch; the lists end above the home indicator
    <main className="flex h-dvh flex-col overflow-hidden bg-background pt-(--safe-top) pr-(--safe-right) pl-(--safe-left)">
      <header className="@container flex min-h-12 shrink-0 items-center gap-2 border-b border-border px-2 md:px-3">
        {params.id && mobile ? (
          <Link to={hrefOf()} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "h-10 text-muted-foreground")}>
            <ArrowLeft aria-hidden />
            {t("notes.backToList")}
          </Link>
        ) : (
          <Link
            to={back}
            data-tour="notes-mark"
            // Phones: the arrow + place say it ("Tilbage til" would push the
            // place off the row); the name stays whole
            aria-label={backRef ? t("notes.backToPlace", { ref: backRef }) : undefined}
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "min-w-0 shrink text-muted-foreground max-md:h-10")}
          >
            {backRef ? <ArrowLeft aria-hidden /> : <BookOpen aria-hidden />}
            {backRef ? (
              <>
                <span className="truncate max-sm:hidden">{t("notes.backToPlace", { ref: backRef })}</span>
                {/* The book name gives way, never the chapter number */}
                <span className="truncate sm:hidden">{nameOfRef(backRef)[0]}</span>
                <span className="shrink-0 sm:hidden">{nameOfRef(backRef)[1]}</span>
              </>
            ) : (
              t("notes.backToReading")
            )}
          </Link>
        )}
        <h1 className={cn("min-w-0 flex-1 truncate font-serif text-title font-medium", params.id && mobile && "sr-only")}>
          {t("notes.title")}
        </h1>
        {params.id && mobile && <span className="flex-1" />}
        {/* A note open on a narrow row (a phone at 200% text, #196): beside
            the way back, just the +, its name kept for screen readers */}
        <Button
          size="sm"
          className={cn("max-md:h-10", params.id && mobile && "@max-[12.5rem]:w-10 @max-[12.5rem]:px-0")}
          data-tour="notes-new"
          onClick={() => void newNote()}
        >
          <Plus aria-hidden />
          <span className={cn(params.id && mobile && "@max-[12.5rem]:sr-only")}>{t("notes.new")}</span>
        </Button>
      </header>
      <div className="flex min-h-0 flex-1">
        {listPane}
        {editorPane}
      </div>
      {/* First visit (#162): search, sort, new note — while no note is open */}
      <NotesTourHost root={tourRoot} enabled={loaded && !params.id} kit={TOUR_KIT} />
    </main>
  );
}

/** `/notes/<id>` for a note that isn't (or is no longer) there. Its heading
 * takes focus: arriving from a link, that's the news. */
function MissingNote({ backHref }: { backHref: string }) {
  const { t } = useTranslation();
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus({ preventScroll: true }), []);
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <h2 ref={headingRef} tabIndex={-1} className="font-serif text-title font-medium text-balance focus:outline-none">
        {t("notes.missingTitle")}
      </h2>
      <p className="max-w-sm font-serif text-control text-pretty text-muted-foreground">{t("notes.missingBody")}</p>
      <Link to={backHref} className={cn(buttonVariants({ variant: "outline" }), "mt-2 h-10 px-4")}>
        {t("notes.backToList")}
      </Link>
    </div>
  );
}

/** Older chapter topics (tagged on a chapter, not a note) under the topic
 * filter — still readable, still removable; new topics go on notes. */
function TopicChapters({ name, onClear }: { name: string; onClear: () => void }) {
  const { t, i18n } = useTranslation();
  const nameOf = useBookName();
  const locale = bookLocale(i18n.language);
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["topic", name],
    queryFn: () =>
      api<{ tag: Tag; passages: { translationId: string; book: string; chapter: number }[] }>(
        `/api/tags/topic/${encodeURIComponent(name)}`,
      ).catch(() => null),
  });
  async function untag(p: { translationId: string; book: string; chapter: number }) {
    if (!data) return;
    const params = new URLSearchParams({ translation: p.translationId, book: p.book, chapter: String(p.chapter) });
    try {
      await api(`/api/tags/passage/${data.tag.id}?${params}`, { method: "DELETE" });
    } catch (e) {
      notifyError(e);
      return;
    }
    void qc.invalidateQueries({ queryKey: ["topic"] });
    void qc.invalidateQueries({ queryKey: ["connections"] });
    notifyUndo(t("toast.tagRemoved", { name }), async () => {
      await api("/api/tags/passage", { method: "POST", body: JSON.stringify({ ...p, name }) });
      void qc.invalidateQueries({ queryKey: ["topic"] });
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p className="flex items-center gap-1 text-meta text-muted-foreground">
        {t("notes.filteredBy", { name })}
        <button
          type="button"
          onClick={onClear}
          aria-label={t("notes.clearTopic")}
          className={cn("inline-flex size-6 items-center justify-center rounded hover:text-foreground", focusRing)}
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </p>
      {data && data.passages.length > 0 && (
        <div className="text-meta text-muted-foreground">
          <span>{t("notes.topicChapters")} </span>
          <ul className="inline">
            {data.passages.map((p) => {
              const label = referenceLabel({ book: p.book, chapter: p.chapter }, nameOf, locale);
              return (
                <li key={`${p.translationId}/${p.book}.${p.chapter}`} className="mr-2 inline-flex items-center">
                  <Link to={`/read/${p.book}/${p.chapter}`} className={cn("rounded text-primary hover:underline", focusRing)}>
                    {label}
                  </Link>
                  <button
                    type="button"
                    onClick={() => void untag(p)}
                    aria-label={t("notes.removeChapterTopic", { name, ref: label })}
                    className={cn("inline-flex size-6 items-center justify-center rounded hover:text-destructive", focusRing)}
                  >
                    <X className="size-3" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

/** "Salme 23" → ["Salme", "23"]: the name may truncate, the number never. */
function nameOfRef(ref: string): [string, string] {
  const at = ref.lastIndexOf(" ");
  return at < 0 ? [ref, ""] : [ref.slice(0, at), ref.slice(at + 1)];
}
