import { useTranslation } from "react-i18next";
import type { Note, Tag } from "@biblestdy/shared";
import { anchorReference, formatReference } from "@biblestdy/shared";
import { ArrowLeft } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { ListSkeleton } from "~/components/list-skeleton";
import { ScrollArea } from "~/components/ui/scroll-area";
import { apiUrl } from "~/lib/api-base";
import { loadReaderStyle } from "~/lib/reader-style";
import { loadTextSize } from "~/lib/text-size";
import { requireAuth } from "~/lib/require-auth";
import type { Route } from "./+types/topic";

interface Topic {
  tag: Tag;
  notes: Note[];
  passages: { translationId: string; book: string; chapter: number }[];
}

export function meta({ params }: Route.MetaArgs) {
  return [{ title: `${params.name} — biblestdy` }];
}

export async function clientLoader() {
  const session = await requireAuth();
  await Promise.all([loadReaderStyle(session.user.id), loadTextSize(session.user.id)]);
  return null;
}

/** null = no such topic (404). */
async function fetchTopic(name: string): Promise<Topic | null> {
  const res = await fetch(apiUrl(`/api/tags/topic/${encodeURIComponent(name)}`), {
    credentials: "include",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET topic -> ${res.status}`);
  return (await res.json()) as Topic;
}

/** The topic page (issue #10): everything tagged with one topic — notes and
 * passages — each linking back into the reader. The page frame shows at once
 * with skeleton rows while the topic loads (#64). */
export default function TopicPage({ params }: Route.ComponentProps) {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: ["topic", params.name],
    queryFn: () => fetchTopic(params.name),
  });

  return (
    <main className="h-dvh overflow-hidden bg-background">
      <ScrollArea className="h-full">
        <div className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-10">
          <header>
            <Link
              to="/"
              className="mb-4 flex items-center gap-1 text-meta text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-3" /> {t("topic.back")}
            </Link>
            <span className="eyebrow">
              {t("topic.label")}
            </span>
            <h1 className="font-serif text-display font-medium tracking-tight">
              {query.data?.tag.name ?? params.name}
            </h1>
          </header>
          {query.isPending ? (
            <ListSkeleton sections={[3, 2]} className="-mx-2 gap-8" />
          ) : query.isError || !query.data ? (
            <p role="alert" className="font-serif text-control text-muted-foreground italic">
              {query.isError ? t("topic.loadError") : t("topic.notFound")}
            </p>
          ) : (
            <TopicBody topic={query.data} />
          )}
        </div>
      </ScrollArea>
    </main>
  );
}

function TopicBody({ topic }: { topic: Topic }) {
  const { t } = useTranslation();

  return (
    <>
      <section>
        <h2 className="eyebrow mb-2">
          {t("topic.notes")}
        </h2>
        {topic.notes.length === 0 && (
          <p className="font-serif text-control text-muted-foreground italic">
            {t("topic.emptyNotes")}
          </p>
        )}
        <div className="flex flex-col gap-1">
          {topic.notes.map((n) => {
            const a = n.anchors[0];
            return (
              <Link
                key={n.id}
                to={a ? `/read/${a.book}/${a.chapter}?note=${n.id}` : "/"}
                className="rounded px-2 py-1.5 hover:bg-accent"
              >
                <span className="block truncate font-serif text-phone">
                  {n.title || t("note.untitled")}
                </span>
                <span className="block truncate font-mono text-meta text-muted-foreground">
                  {n.anchors.map((x) => formatReference(anchorReference(x))).join(" · ")}
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="eyebrow mb-2">
          {t("topic.passages")}
        </h2>
        {topic.passages.length === 0 && (
          <p className="font-serif text-control text-muted-foreground italic">
            {t("topic.emptyPassages")}
          </p>
        )}
        <div className="flex flex-col gap-1">
          {topic.passages.map((p) => (
            <Link
              key={`${p.translationId}/${p.book}.${p.chapter}`}
              to={`/read/${p.book}/${p.chapter}`}
              className="rounded px-2 py-1.5 font-serif text-phone hover:bg-accent"
            >
              {formatReference({ book: p.book, chapter: p.chapter })}
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
