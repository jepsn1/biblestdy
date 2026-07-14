import { useTranslation } from "react-i18next";
import type { Note, Tag } from "@biblestdy/shared";
import { anchorReference, formatReference } from "@biblestdy/shared";
import { ArrowLeft } from "lucide-react";
import { data, Link } from "react-router";
import { ScrollArea } from "~/components/ui/scroll-area";
import i18n from "~/lib/i18n";
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

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  await requireAuth();
  const res = await fetch(`/api/tags/topic/${encodeURIComponent(params.name)}`, {
    credentials: "include",
  });
  if (res.status === 404) throw data(i18n.t("topic.notFound"), { status: 404 });
  if (!res.ok) throw data(i18n.t("topic.loadError"), { status: 502 });
  return { topic: (await res.json()) as Topic };
}

/** The topic page (issue #10): everything tagged with one topic — notes and
 * passages — each linking back into the reader. */
export default function TopicPage({ loaderData }: Route.ComponentProps) {
  const { topic } = loaderData;
  const { t } = useTranslation();

  return (
    <main className="h-dvh overflow-hidden bg-background">
      <ScrollArea className="h-full">
        <div className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-10">
          <header>
            <Link
              to="/"
              className="mb-4 flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-3" /> {t("topic.back")}
            </Link>
            <span className="font-mono text-[0.65rem] tracking-widest text-primary/80 uppercase">
              {t("topic.label")}
            </span>
            <h1 className="font-serif text-3xl font-medium tracking-tight">{topic.tag.name}</h1>
          </header>

          <section>
            <h2 className="mb-2 font-sans text-[0.7rem] font-semibold tracking-widest text-primary/80 uppercase">
              {t("topic.notes")}
            </h2>
            {topic.notes.length === 0 && (
              <p className="font-serif text-sm text-muted-foreground italic">
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
                    <span className="block truncate font-serif text-base">
                      {n.title || t("note.untitled")}
                    </span>
                    <span className="block truncate font-mono text-[0.65rem] text-muted-foreground">
                      {n.anchors.map((x) => formatReference(anchorReference(x))).join(" · ")}
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>

          <section>
            <h2 className="mb-2 font-sans text-[0.7rem] font-semibold tracking-widest text-primary/80 uppercase">
              {t("topic.passages")}
            </h2>
            {topic.passages.length === 0 && (
              <p className="font-serif text-sm text-muted-foreground italic">
                {t("topic.emptyPassages")}
              </p>
            )}
            <div className="flex flex-col gap-1">
              {topic.passages.map((p) => (
                <Link
                  key={`${p.translationId}/${p.book}.${p.chapter}`}
                  to={`/read/${p.book}/${p.chapter}`}
                  className="rounded px-2 py-1.5 font-serif text-base hover:bg-accent"
                >
                  {formatReference({ book: p.book, chapter: p.chapter })}
                </Link>
              ))}
            </div>
          </section>
        </div>
      </ScrollArea>
    </main>
  );
}
