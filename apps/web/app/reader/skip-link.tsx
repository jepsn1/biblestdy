import { useTranslation } from "react-i18next";
import { CHAPTER_TEXT_ID } from "./paginated-chapter";

/**
 * "Skip to text" (#61): the first focusable element on the reader, visible
 * only on keyboard focus. Moves focus to the chapter text without scrolling —
 * the body is locked and the paged reader positions its text itself.
 */
export function SkipToText() {
  const { t } = useTranslation();
  return (
    <a
      href={`#${CHAPTER_TEXT_ID}`}
      onClick={(e) => {
        e.preventDefault();
        document.getElementById(CHAPTER_TEXT_ID)?.focus({ preventScroll: true });
      }}
      className="sr-only rounded-md bg-primary px-3 py-2 text-control font-medium text-primary-foreground shadow-md focus:not-sr-only focus:fixed focus:top-[calc(0.5rem+var(--safe-top))] focus:left-[calc(0.5rem+var(--safe-left))] focus:z-[60] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {t("reader.skipToText")}
    </a>
  );
}
