import type { MarkLink, ScriptureRef } from "@biblestdy/shared";
import { Search } from "lucide-react";
import { useId, useMemo, useState, type Ref } from "react";
import { useTranslation } from "react-i18next";
import { ScrollArea } from "~/components/ui/scroll-area";
import { bookLocale, useBookName } from "~/lib/book-name";
import { referenceLabel } from "~/lib/reference-label";
import { cn } from "~/lib/utils";
import type { PageMark } from "../notes/page-marks";
import { MarkRow } from "./mark-row";
import { bookFill, insertable, verseSuggestions, type VerseSuggestion } from "./verse-suggest";

/**
 * "+ Verse" in the app with the keyboard up (#277 panel V-A, 6/6): the bar
 * turns into a verse search riding the keyboard — field, Insert, Cancel —
 * with what you've typed resolved in a short list above it, and the note
 * still in sight over it all. No sheet: the note never leaves the screen
 * and the keyboard never goes down (the field is focused inside the tap,
 * verse-button). Web and desktop keep the dialog (verse-picker).
 */
export function VerseRow({
  inputRef,
  marks,
  describe,
  onPick,
  onCancel,
}: {
  inputRef: Ref<HTMLInputElement>;
  marks: readonly PageMark[];
  describe: (m: PageMark) => string;
  onPick: (ref: ScriptureRef, mark?: MarkLink) => void;
  onCancel: () => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = bookLocale(i18n.language);
  const nameOf = useBookName();
  const ids = useId();
  const [text, setText] = useState("");
  const [active, setActive] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const rows = useMemo(() => verseSuggestions(text, locale, marks, describe), [text, locale, marks, describe]);
  const at = Math.min(active, rows.length - 1);
  const chosen = rows[at] ?? null;
  const target = chosen && chosen.kind !== "book" ? chosen : insertable(rows);

  function pick(row: VerseSuggestion | null) {
    if (!row) {
      if (text.trim()) setProblem(t(rows[0]?.kind === "book" ? "note.refNeedsChapter" : "note.refUnknown"));
      return;
    }
    if (row.kind === "book") {
      const next = bookFill(row.name);
      setText(next);
      setActive(0);
      setProblem(null);
      return;
    }
    if (row.kind === "mark") onPick(row.mark.ref, row.mark.mark);
    else onPick(row.ref);
  }

  const label = (row: VerseSuggestion) => (row.kind === "ref" ? referenceLabel(row.ref, nameOf, locale) : "");
  const optionId = (i: number) => `${ids}-o${i}`;

  return (
    <div className="verse-row" data-verse-row="">
      {rows.length > 0 && (
        <div className="verse-suggest">
          {!text.trim() && (
            <p aria-hidden className="verse-suggest-head">
              {t("note.typeaheadOnPage")}
            </p>
          )}
          <ScrollArea viewportClassName="max-h-[min(12.5rem,24dvh)]">
            <ul id={`${ids}-list`} role="listbox" aria-label={t("note.dockSuggestions")}>
              {rows.map((row, i) => (
                // Keys stay in the field (aria-activedescendant): moving focus
                // into the list could drop the keyboard (Jonas)
                // eslint-disable-next-line jsx-a11y/click-events-have-key-events
                <li
                  key={row.key}
                  id={optionId(i)}
                  role="option"
                  aria-selected={i === at}
                  data-verse-option=""
                  onClick={() => pick(row)}
                  className={cn("verse-option", i === at && "is-active")}
                >
                  {row.kind === "mark" ? (
                    <MarkRow mark={row.mark} locale={locale} kind={describe(row.mark)} active={i === at} />
                  ) : (
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">{row.kind === "ref" ? label(row) : row.name}</span>
                      {(row.kind === "book" || row.fuzzy || row.ref.verse === undefined) && (
                        <span className="verse-option-note">
                          {row.kind === "book" ? t("note.dockTypeChapter") : row.fuzzy ? t("note.dockGuess") : t("note.dockWholeChapter")}
                        </span>
                      )}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </ScrollArea>
        </div>
      )}
      <p id={`${ids}-status`} aria-live="polite" className={cn("verse-problem", !problem && "sr-only")}>
        {problem}
      </p>
      <form
        role="search"
        aria-label={t("note.dockVerseRow")}
        className="verse-row-bar"
        onSubmit={(e) => {
          e.preventDefault();
          pick(target);
        }}
      >
        <label className="verse-field">
          <Search aria-hidden className="size-[18px] shrink-0 text-muted-foreground" />
          <span className="sr-only">{t("note.insertVerseLabel")}</span>
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-controls={`${ids}-list`}
            aria-expanded={rows.length > 0}
            aria-autocomplete="list"
            aria-activedescendant={chosen ? optionId(at) : undefined}
            aria-describedby={`${ids}-status`}
            aria-invalid={problem ? true : undefined}
            // "rom" must not become "Rome", nor QuickType change the
            // keyboard's height mid-flow (Jonas F4)
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="go"
            data-1p-ignore
            data-lpignore="true"
            placeholder={t("note.dockVersePlaceholder")}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setActive(0);
              setProblem(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                onCancel();
              } else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && rows.length) {
                e.preventDefault();
                setActive(Math.max(0, Math.min(rows.length - 1, at + (e.key === "ArrowDown" ? 1 : -1))));
              }
            }}
          />
        </label>
        <button type="submit" className="verse-insert" aria-disabled={!target || undefined}>
          {t("note.insert")}
        </button>
        <button type="button" className="verse-cancel" data-no-tick="" onClick={onCancel}>
          {t("note.dockCancel")}
        </button>
      </form>
    </div>
  );
}
