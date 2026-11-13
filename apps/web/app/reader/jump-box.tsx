import { findBook, parseReference, suggestBooks } from "@biblestdy/shared";
import { Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { Hint } from "~/components/hint";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { bookLocale } from "~/lib/book-name";
import { ignoreShortcut } from "~/lib/shortcuts";
import { cn } from "~/lib/utils";
import { referenceHref } from "./chapter-nav";

/** The book part while it's still being typed: no chapter digits yet. */
const BOOK_PART = /^\s*(\d?\.?\s*\p{L}[\p{L}\s.']*)$/u;

/**
 * "Go to reference" (#53): typed reference → that verse (`?v=`), with book
 * autocomplete (English + Danish names) and a visible error. Desktop: inline
 * in the nav, `/` focuses it. Phone: a search icon that opens it over the
 * nav row.
 */
export function JumpBox() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const locale = bookLocale(i18n.language);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);
  const [focused, setFocused] = useState(false);
  /** Phone overlay open (desktop always shows the box). */
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const bookPart = BOOK_PART.exec(value)?.[1];
  // A finished book name + space ("Johannes ") — next comes the chapter
  const bookDone = /\s$/.test(value) && !!bookPart && !!findBook(bookPart.trim(), locale);
  const suggestions = focused && bookPart && !bookDone ? suggestBooks(bookPart, locale) : [];

  // "/" focuses the jump box from anywhere
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "/" && !ignoreShortcut(event)) {
        event.preventDefault();
        setOpen(true);
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function close() {
    setOpen(false);
    setError(false);
    setActive(-1);
    inputRef.current?.blur();
  }

  function pick(name: string) {
    setValue(`${name} `);
    setActive(-1);
    setError(false);
    inputRef.current?.focus();
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (active >= 0 && suggestions[active]) {
      pick(suggestions[active].name);
      return;
    }
    const ref = parseReference(value, locale);
    if (!ref) {
      setError(true);
      return;
    }
    setValue("");
    close();
    navigate(referenceHref(ref));
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (suggestions.length > 0 && active >= 0) setActive(-1);
      else close();
    } else if (event.key === "ArrowDown" && suggestions.length > 0) {
      event.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (event.key === "ArrowUp" && suggestions.length > 0) {
      event.preventDefault();
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (event.key === "Tab" && !event.shiftKey && suggestions.length > 0) {
      event.preventDefault();
      pick(suggestions[Math.max(0, active)].name);
    }
  }

  const showList = suggestions.length > 0;

  return (
    <>
      <Hint label={t("nav.jumpOpen")} shortcut="/">
        <Button
          variant="ghost"
          size="icon-sm"
          className="ml-auto sm:hidden"
          aria-label={t("nav.jumpOpen")}
          onClick={() => setOpen(true)}
        >
          <Search />
        </Button>
      </Hint>

      <form
        onSubmit={onSubmit}
        className={cn(
          open ? "absolute inset-0 z-30 flex items-center gap-2 bg-background px-3" : "hidden",
          "sm:static sm:z-auto sm:ml-auto sm:flex sm:bg-transparent sm:px-0",
        )}
      >
        <div className="relative min-w-0 flex-1 sm:flex-none">
          <Input
            ref={inputRef}
            role="combobox"
            aria-label={t("nav.goToReference")}
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
            aria-invalid={error || undefined}
            aria-describedby={error ? `${listId}-error` : undefined}
            placeholder={t("nav.goToReference")}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="go"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(false);
              setActive(-1);
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false);
              setActive(-1);
            }}
            onKeyDown={onKeyDown}
            className="h-8 w-full pr-8 font-mono text-control placeholder:font-sans sm:h-7 sm:w-44 sm:text-meta"
          />
          <kbd className="pointer-events-none absolute top-1/2 right-1.5 hidden -translate-y-1/2 rounded border border-border bg-muted px-1 font-mono text-meta text-muted-foreground sm:block">
            /
          </kbd>

          {showList && (
            <ul
              id={listId}
              role="listbox"
              aria-label={t("nav.jumpSuggestions")}
              className="absolute top-full right-0 left-0 z-40 mt-1 min-w-56 overflow-hidden rounded-md border border-border bg-popover py-1 text-popover-foreground shadow-md sm:left-auto"
            >
              {suggestions.map((s, i) => (
                <li
                  key={s.id}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  // mousedown, not click: keep the input focused
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(s.name);
                  }}
                  className={cn(
                    "flex cursor-pointer items-baseline justify-between gap-3 px-3 py-1.5 text-control",
                    i === active && "bg-accent text-accent-foreground",
                  )}
                >
                  <span className="font-serif">{s.name}</span>
                  {s.alt && <span className="truncate text-meta text-muted-foreground">{s.alt}</span>}
                </li>
              ))}
            </ul>
          )}

          {error && !showList && (
            <p
              id={`${listId}-error`}
              role="alert"
              className="absolute top-full right-0 left-0 z-40 mt-1 min-w-56 rounded-md border border-destructive/40 bg-popover px-3 py-1.5 text-meta text-destructive shadow-md sm:left-auto"
            >
              {t("nav.jumpInvalid")}
            </p>
          )}
        </div>

        <Hint label={t("nav.jumpClose")} shortcut="Esc">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="sm:hidden"
            aria-label={t("nav.jumpClose")}
            onClick={() => {
              setValue("");
              close();
            }}
          >
            <X />
          </Button>
        </Hint>
      </form>
    </>
  );
}
