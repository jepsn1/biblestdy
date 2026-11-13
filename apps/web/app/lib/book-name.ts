import { bookName, type BookLocale } from "@biblestdy/shared";
import { useTranslation } from "react-i18next";

/** UI locale → book-name locale (#53). */
export function bookLocale(language: string | undefined): BookLocale {
  return language?.startsWith("da") ? "da" : "en";
}

/** Book display names in the UI language ("John" / "Johannes"). Not in the
 * locale files: those load in the SSR'd root, which can't import shared. */
export function useBookName(): (id: string) => string {
  const { i18n } = useTranslation();
  const locale = bookLocale(i18n.language);
  return (id) => bookName(id, locale);
}
