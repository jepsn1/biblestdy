import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "~/lib/utils"

// Touch (#262 panel P1, Jonas): every size's height lives in --btn-h, and a
// coarse pointer raises it to at least 44px — px, so 200% text doesn't double
// it. A call site's own h-* / size-* still wins (same twMerge group), so a
// link-styled Button inside a line (h-auto p-0) stays in its line.
const buttonVariants = cva(
  "[--btn-h:var(--btn-h-fine)] pointer-coarse:[--btn-h:max(44px,var(--btn-h-fine))] group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-control font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring pointer-fine:active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Filled: a page-coloured gap between fill and ring — on Paper the
        // ring IS the fill colour
        default:
          "bg-primary text-primary-foreground hover:bg-primary/80 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        // Solid (the delete-account confirm): red text on a red tint was
        // under 4.5:1 once enabled
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-(--btn-h) [--btn-h-fine:2rem] gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-meta in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-(--btn-h) [--btn-h-fine:1.75rem] gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-list in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-(--btn-h) [--btn-h-fine:2.25rem] gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-(--btn-h) [--btn-h-fine:2rem]",
        "icon-xs":
          "size-(--btn-h) [--btn-h-fine:1.5rem] rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-(--btn-h) [--btn-h-fine:1.75rem] rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-(--btn-h) [--btn-h-fine:2.25rem]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
