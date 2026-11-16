import { useTranslation } from "react-i18next";
import type { ScriptureRef, Translation } from "@biblestdy/shared";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useId, useState, type Ref } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { bookLocale, useBookName } from "~/lib/book-name";
import i18n from "~/lib/i18n";
import { loadMarkedTranslationId } from "~/lib/preferences";
import { api } from "~/lib/query";
import { readingTranslation } from "~/lib/reading-translation";
import { referenceLabel } from "./note-list";
import { verseOptions } from "./verse-resolver";

/** The translation new references are made (and previews shown) in: the
 * one being read. */
export async function readingTranslationId(): Promise<string> {
  const stored = typeof localStorage !== "undefined" ? localStorage.getItem("translationId") : null;
  if (stored) return stored;
  const translations = await api<Translation[]>("/api/translations");
  return (await readingTranslation(translations, i18n.language, loadMarkedTranslationId)).id;
}

/** The reading translation's id: this device's choice, else resolved. */
export function useReadingTranslationId(): string | undefined {
  const stored = typeof localStorage !== "undefined" ? localStorage.getItem("translationId") : null;
  const { data } = useQuery({ queryKey: ["reading-translation-id"], queryFn: readingTranslationId, enabled: !stored, staleTime: Infinity });
  return stored ?? data;
}

/**
 * The forgiving reference input (notes plan, Phase 1; #160): type a
 * reference — Danish or English, as forgiving as the palette ("rom 8:28-30",
 * "sl 23", "joh 3,16") — and what it will become is said below the field (a
 * live region) before Enter takes it; problems are said there too. The same
 * resolver as the note's `@` typeahead (verse-resolver.ts). `onPick` returns
 * a problem to show, or null when the reference was taken (the field
 * clears).
 */
export function VerseField({
  onPick,
  label,
  placeholder,
  previewKey,
  submitLabel,
  inputRef,
  mobile = false,
  onTextChange,
  onArrowDown,
}: {
  onPick: (ref: ScriptureRef, label: string) => Promise<string | null> | string | null;
  label: string;
  placeholder: string;
  /** i18n key of the preview line, with `{{ref}}` ("Enter adds …"). */
  previewKey: string;
  submitLabel: string;
  inputRef?: Ref<HTMLInputElement>;
  mobile?: boolean;
  /** Each change of the typed text (the dialog filters its page marks, #191). */
  onTextChange?: (text: string) => void;
  /** ↓ in the field: on to what's listed below it. */
  onArrowDown?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = bookLocale(i18n.language);
  const nameOf = useBookName();
  const inputId = useId();
  const statusId = useId();
  const [text, setText] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const first = text.trim() ? verseOptions(text, locale, 1)[0] : undefined;
  const hit = first?.kind === "ref" ? first.ref : undefined;
  const preview = hit ? referenceLabel(hit, nameOf, locale) : null;

  async function submit() {
    if (busy || !text.trim()) return;
    if (!hit || !preview) {
      setProblem(first?.kind === "book" ? t("note.refNeedsChapter") : t("note.refUnknown"));
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      const why = await onPick(hit, preview);
      if (why) setProblem(why);
      else {
        setText("");
        onTextChange?.("");
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
        {label}
      </label>
      <div className="flex items-center gap-1.5">
        <Input
          ref={inputRef}
          id={inputId}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            onTextChange?.(e.target.value);
            setProblem(null);
          }}
          onKeyDown={(e) => {
            // Esc clears the field before it closes the panel
            if (e.key === "Escape" && text) {
              e.preventDefault();
              e.stopPropagation();
              setText("");
              onTextChange?.("");
              setProblem(null);
            }
            if (e.key === "ArrowDown" && onArrowDown) {
              e.preventDefault();
              onArrowDown();
            }
          }}
          placeholder={placeholder}
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          aria-describedby={statusId}
          aria-invalid={problem ? true : undefined}
          className={mobile ? "h-11" : "h-8"}
        />
        <Button type="submit" variant="outline" size={mobile ? "default" : "sm"} disabled={busy || !text.trim()} className={mobile ? "h-11" : undefined}>
          <Plus aria-hidden />
          {submitLabel}
        </Button>
      </div>
      <p id={statusId} aria-live="polite" className={`min-h-4 px-0.5 text-meta ${problem ? "text-destructive" : "text-muted-foreground"}`}>
        {problem ?? (preview ? t(previewKey, { ref: preview }) : "")}
      </p>
    </form>
  );
}
