import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

/** The type scale's size names (app.css, #66). Without them tailwind-merge
 * reads `text-meta` as a colour and drops it next to `text-muted-foreground`. */
export const TYPE_SCALE = ["meta", "list", "control", "phone", "reading", "title", "display"]

const twMerge = extendTailwindMerge({ extend: { theme: { text: TYPE_SCALE } } })

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Shared keyboard focus ring (#61) for raw inputs/textareas/buttons that
 * drop the browser outline — same look as the shadcn Input/Button. 2px of
 * the opaque --ring token: ≥ 3:1 on every theme (WCAG 1.4.11). */
export const focusRing =
  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
