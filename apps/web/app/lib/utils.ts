import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Shared keyboard focus ring (#61) for raw inputs/textareas/buttons that
 * drop the browser outline — same look as the shadcn Input/Button. */
export const focusRing =
  "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
