import { useTranslation } from "react-i18next";
import { daysLeft, type Annotation, type Deleted, type Highlight, type Note } from "@biblestdy/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { InlineNotice } from "~/components/inline-notice";
import { ListSkeleton } from "~/components/list-skeleton";
import { Button, buttonVariants } from "~/components/ui/button";
import { ScrollArea } from "~/components/ui/scroll-area";
import { announce } from "~/lib/announce";
import { bookLocale, useBookName } from "~/lib/book-name";
import { notifyError } from "~/lib/notify";
import { api } from "~/lib/query";
import { trashQuery } from "~/lib/trash";
import { cn, focusRing } from "~/lib/utils";
import { noteRefLabels, noteTitle } from "./note-list";
import { anchorReferenceLabel } from "../reader/copy-attribution";

type Kind = "notes" | "highlights" | "annotations";
type Item = { kind: "notes"; item: Deleted<Note> } | { kind: "highlights"; item: Deleted<Highlight> } | { kind: "annotations"; item: Deleted<Annotation> };

const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

/** "10:34" (today) / "12 Nov, 10:34" — when it was deleted. */
function deletedWhen(iso: string, language: string): string {
  const d = new Date(iso);
  const today = isToday(iso);
  return new Intl.DateTimeFormat(language, today ? { timeStyle: "short" } : { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(d);
}

/**
 * Recently deleted (#261): what the reader deleted in the last 30 days —
 * notes, highlights, margin notes and pen marks — each with what it was,
 * when it went, the days left and a Restore button. A restored row says so
 * in its place, with the way to it (no toast). Reached from the end of the
 * Notes list ("Recently deleted (n)") and named in the delete confirm. It
 * is the Notes route at /notes/deleted (routes/notes.tsx): no route chunk
 * of its own — one would re-split modules the reader shares (bundle budget).
 */
export function TrashView() {
  const { t, i18n } = useTranslation();
  const nameOf = useBookName();
  const locale = bookLocale(i18n.language);
  const qc = useQueryClient();
  const { data, isPending, isError, refetch } = useQuery({ ...trashQuery, staleTime: 0 });
  /** Restored rows, in their places: "Restored · Open". */
  const [restored, setRestored] = useState<Record<string, true>>({});
  const [busy, setBusy] = useState<string | null>(null);

  async function restore({ kind, item }: Item, what: string) {
    setBusy(item.id);
    try {
      await api(`/api/${kind}/${item.id}/restore`, { method: "POST" });
    } catch (e) {
      notifyError(e, { message: t("notes.restoreFailed") });
      setBusy(null);
      return;
    }
    setBusy(null);
    setRestored((r) => ({ ...r, [item.id]: true }));
    announce(`${t("notes.restored")}: ${what}`);
    // Every view of it catches up (the list here keeps the row, restored)
    void qc.invalidateQueries({ queryKey: [kind] });
    if (kind !== "notes") void qc.invalidateQueries({ queryKey: ["notes"] });
    void qc.invalidateQueries({ queryKey: ["connections"] });
  }

  const sections: { kind: Kind; title: string; items: Item[] }[] = data
    ? [
        { kind: "notes" as const, title: t("notes.trashNotes"), items: data.notes.map((item) => ({ kind: "notes" as const, item })) },
        { kind: "highlights" as const, title: t("notes.trashHighlights"), items: data.highlights.map((item) => ({ kind: "highlights" as const, item })) },
        { kind: "annotations" as const, title: t("notes.trashAnnotations"), items: data.annotations.map((item) => ({ kind: "annotations" as const, item })) },
      ].filter((s) => s.items.length > 0)
    : [];

  function row(entry: Item) {
    const { kind, item } = entry;
    let name: string;
    let detail: string;
    let href: string;
    if (kind === "notes") {
      name = noteTitle(item, t("note.untitled"));
      detail = noteRefLabels(item, nameOf, locale).join(" · ");
      href = `/notes/${item.id}`;
    } else {
      const ref = anchorReferenceLabel(item, locale);
      const words = item.quote ? t("notes.quoted", { text: item.quote }) : "";
      name = kind === "annotations" ? item.text || (words ? `${t("notes.trashPenMark")}: ${words}` : t("notes.trashPenMark")) : words || ref;
      detail = ref;
      href = `/read/${item.book}/${item.chapter}?v=${item.startVerse}`;
    }
    const left = daysLeft(item.deletedAt);
    const done = restored[item.id];
    return (
      <li key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-3 py-3 last:border-b-0">
        <div className="min-w-0 flex-1 basis-56">
          <p className={cn("truncate font-serif text-control font-medium", kind === "highlights" && "font-normal italic")}>{name}</p>
          {detail && <p className="truncate text-meta text-primary tabular-nums">{detail}</p>}
          <p className="text-meta text-muted-foreground tabular-nums">
            {t(isToday(item.deletedAt) ? "notes.trashDeletedToday" : "notes.trashDeletedOn", { when: deletedWhen(item.deletedAt, i18n.language) })} · {t("notes.trashDaysLeft", { count: left })}
          </p>
        </div>
        {done ? (
          <p className="flex min-h-11 items-center gap-2 text-control text-muted-foreground md:min-h-9">
            {t("notes.restored")}
            <span aria-hidden>·</span>
            <Link to={href} className={cn("rounded-sm font-medium text-foreground underline underline-offset-4", focusRing)}>
              {kind === "notes" ? t("notes.openRestored") : t("notes.showRestored")}
            </Link>
          </p>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="max-md:h-11 max-md:px-4"
            disabled={busy === item.id}
            aria-label={t("notes.restoreNamed", { what: name })}
            onClick={() => void restore(entry, name)}
          >
            {t("notes.restore")}
          </Button>
        )}
      </li>
    );
  }

  return (
    // Safe areas (#251), as the Notes page
    <main className="flex h-dvh flex-col overflow-hidden bg-background pt-(--safe-top) pr-(--safe-right) pl-(--safe-left)">
      <header className="flex min-h-12 shrink-0 items-center gap-2 border-b border-border px-2 md:px-3">
        <Link to="/notes" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-muted-foreground max-md:h-10")}>
          <ArrowLeft aria-hidden />
          {t("notes.backToNotes")}
        </Link>
        <h1 className="min-w-0 flex-1 truncate font-serif text-title font-medium">{t("notes.trashTitle")}</h1>
      </header>
      {/* Errors (a failed restore) — one line under the header (#257) */}
      <InlineNotice place="page" lineClassName="justify-start border-b border-border px-4 py-1.5 text-left" />
      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto w-full max-w-[44rem] pb-(--corner-bottom)">
          <p className="px-3 pt-4 pb-2 font-serif text-control text-pretty text-muted-foreground">{t("notes.trashIntro")}</p>
          {isPending ? (
            <ListSkeleton sections={[3]} className="p-3" />
          ) : isError ? (
            <div role="alert" className="flex flex-col items-start gap-2 p-3">
              <p className="font-serif text-control text-muted-foreground italic">{t("notes.trashLoadError")}</p>
              <Button variant="outline" size="sm" onClick={() => void refetch()}>
                {t("note.retry")}
              </Button>
            </div>
          ) : sections.length === 0 ? (
            <p className="p-3 font-serif text-control text-muted-foreground italic">{t("notes.trashEmpty")}</p>
          ) : (
            sections.map((s) => (
              <section key={s.kind} aria-labelledby={`trash-${s.kind}`} className="pt-3">
                <h2 id={`trash-${s.kind}`} className="px-3 pb-1 text-meta font-medium tracking-wide text-muted-foreground uppercase">
                  {s.title} · {s.items.length}
                </h2>
                <ul>{s.items.map(row)}</ul>
              </section>
            ))
          )}
        </div>
      </ScrollArea>
    </main>
  );
}
