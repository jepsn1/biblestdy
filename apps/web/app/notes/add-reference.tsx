import { useTranslation } from "react-i18next";
import type { Anchor, Chapter, Translation } from "@biblestdy/shared";
import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { bookLocale, useBookName } from "~/lib/book-name";
import { api } from "~/lib/query";
import { findPassages } from "../palette/passage-query";
import { anchorForReference, referenceLabel } from "./note-list";

/** The translation new references are made in: the one being read. */
async function readingTranslationId(): Promise<string> {
  const stored = typeof localStorage !== "undefined" ? localStorage.getItem("translationId") : null;
  if (stored) return stored;
  const translations = await api<Translation[]>("/api/translations");
  return translations[0].id;
}

/**
 * "Add passage" (notes plan, Phase 1): type a reference — Danish or English,
 * as forgiving as the palette ("rom 8:28-30", "sl 23") — and the note cites
 * those whole verses in the reading translation. What the text will become
 * is said below the field (a live region) before Enter adds it; problems are
 * said there too. Selecting words in the reader stays the precise way.
 */
export function AddReference({
  onAdd,
  mobile = false,
}: {
  onAdd: (anchor: Anchor) => Promise<unknown>;
  mobile?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const locale = bookLocale(i18n.language);
  const nameOf = useBookName();
  const qc = useQueryClient();
  const inputId = useId();
  const statusId = useId();
  const [text, setText] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const hit = text.trim() ? findPassages(text, locale, 1)[0] : undefined;
  const preview = hit ? referenceLabel(hit.ref, nameOf, locale) : null;

  async function submit() {
    if (!hit || busy) {
      if (text.trim()) setProblem(t("note.refUnknown"));
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      const translationId = await readingTranslationId();
      const ref = hit.ref;
      if (ref.chapter === undefined) {
        setProblem(t("note.refNeedsChapter"));
        return;
      }
      const chapter = await qc.fetchQuery({
        queryKey: ["chapter", translationId, ref.book, ref.chapter],
        queryFn: () => api<Chapter>(`/api/passages/${translationId}/${ref.book}/${ref.chapter}`),
        staleTime: 60 * 60 * 1000, // scripture text is immutable
      });
      const anchor = anchorForReference(ref, chapter);
      if (anchor === "noChapter") setProblem(t("note.refNeedsChapter"));
      else if (anchor === "crossChapter") setProblem(t("note.refOneChapter"));
      else if (anchor === "noVerse") setProblem(t("note.refNoVerse", { ref: preview }));
      else {
        await onAdd(anchor);
        setText("");
      }
    } catch {
      setProblem(t("note.refLoadFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <label htmlFor={inputId} className="sr-only">
        {t("note.addReference")}
      </label>
      <div className="flex items-center gap-1.5">
        <Input
          id={inputId}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setProblem(null);
          }}
          onKeyDown={(e) => {
            // Esc clears the field before it closes the panel
            if (e.key === "Escape" && text) {
              e.preventDefault();
              setText("");
              setProblem(null);
            }
          }}
          placeholder={t("note.addReferencePlaceholder")}
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          aria-describedby={statusId}
          aria-invalid={problem ? true : undefined}
          className={mobile ? "h-11" : "h-8"}
        />
        <Button type="submit" variant="outline" size={mobile ? "default" : "sm"} disabled={busy || !text.trim()} className={mobile ? "h-11" : undefined}>
          <Plus aria-hidden />
          {t("note.add")}
        </Button>
      </div>
      <p id={statusId} aria-live="polite" className={`min-h-4 px-0.5 text-meta ${problem ? "text-destructive" : "text-muted-foreground"}`}>
        {problem ?? (preview ? t("note.refPreview", { ref: preview }) : "")}
      </p>
    </form>
  );
}
