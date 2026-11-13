import type { HighlightColor } from "@biblestdy/shared";
import { HIGHLIGHT_COLORS } from "@biblestdy/shared";
import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { Check } from "lucide-react";
import { createContext, useContext, type ReactNode, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "~/components/ui/dropdown-menu";
import { Drawer, DrawerContent, DrawerTitle } from "~/components/ui/drawer";
import { Popover, PopoverContent } from "~/components/ui/popover";
import { cn, focusRing } from "~/lib/utils";
import { HIGHLIGHT_SWATCH } from "./highlight-colors";

/**
 * Items never close the menu themselves: the shell does (Base UI on item
 * press, the drawer items explicitly) and reports it via onOpenChange — so
 * the caller learns whether a key closed it and can return focus.
 *
 * The reader's action menu (#63) — one component for every "do something
 * with these words" moment: a fresh selection, a tap on an existing
 * highlight, and (#65) keyboard selections. Same children, two shells:
 * - Desktop: a Base UI menu (role=menu, arrow keys, Esc, focus return)
 *   anchored to a virtual rect — the selected line.
 * - Phone: a non-modal bottom drawer with big targets; the text stays
 *   interactive so the selection handles keep working.
 *
 *   <ActionMenu open anchor mobile label onOpenChange>
 *     <ActionMenuColors … /> <ActionMenuSeparator />
 *     <ActionMenuItem onSelect={…}>Copy</ActionMenuItem>
 *   </ActionMenu>
 */

/** Anything with a live rect — re-read on every reposition. */
export type VirtualAnchor = { getBoundingClientRect: () => DOMRect };

/** Phone drawer elements: the reader keeps them from closing the selection. */
export const SELECTION_UI_ATTR = "data-selection-ui";

type Ctx = { mobile: boolean; close: () => void };
const MenuCtx = createContext<Ctx>({ mobile: false, close: () => {} });

/** Closed by keyboard (Esc, Enter on an item)? Then the caller moves focus
 * back to the text; pointer closes leave focus alone (no stray rings). */
function byKeyboard(event: Event | undefined) {
  // Base UI hands over React's synthetic event for item presses, the native
  // one for Esc — compare by type, not instanceof
  const e = (event as (Event & { nativeEvent?: Event }) | undefined)?.nativeEvent ?? event;
  if (!e) return false;
  return e.type.startsWith("key") || (e.type === "click" && (e as MouseEvent).detail === 0);
}

/** Outside presses that never close the menu: the phone's selection handles,
 * and the words themselves — the reader decides what a press on a word means
 * (a new selection replaces the menu, a plain click closes it). Without this
 * the tap that opens the drawer would also count as its outside press. */
function keepsOpen(details: { reason: string; event?: Event }) {
  if (details.reason !== "outside-press") return false;
  const target = details.event?.target as Element | null | undefined;
  return !!target?.closest?.(`[${SELECTION_UI_ATTR}], [data-word]`);
}

export function ActionMenu({
  open,
  onOpenChange,
  anchor,
  mobile,
  label,
  children,
}: {
  open: boolean;
  /** `keyboard`: closed by a key — return focus to where the reader was. */
  onOpenChange: (open: boolean, keyboard: boolean) => void;
  anchor: VirtualAnchor | null;
  mobile: boolean;
  /** Accessible name of the menu ("Selection", "Highlight"). */
  label: string;
  children: ReactNode;
}) {
  const close = () => onOpenChange(false, false);
  if (mobile) {
    return (
      <MenuCtx.Provider value={{ mobile, close }}>
        <Drawer
          open={open}
          modal={false}
          showSwipeHandle
          onOpenChange={(next, details) => {
            if (!next && keepsOpen(details)) return;
            onOpenChange(next, byKeyboard(details.event));
          }}
        >
          <DrawerContent {...{ [SELECTION_UI_ATTR]: "" }} finalFocus={false}>
            <DrawerTitle className="sr-only">{label}</DrawerTitle>
            <div className="flex flex-col px-3 pt-1 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
              {children}
            </div>
          </DrawerContent>
        </Drawer>
      </MenuCtx.Provider>
    );
  }
  return (
    <MenuCtx.Provider value={{ mobile, close }}>
      <DropdownMenu
        open={open}
        modal={false}
        onOpenChange={(next, details) => {
          if (!next && keepsOpen(details)) return;
          onOpenChange(next, byKeyboard(details.event));
        }}
      >
        <DropdownMenuContent
          anchor={anchor}
          side="top"
          align="center"
          sideOffset={8}
          aria-label={label}
          finalFocus={false}
          {...{ [SELECTION_UI_ATTR]: "" }}
          className="w-auto min-w-52"
        >
          {children}
        </DropdownMenuContent>
      </DropdownMenu>
    </MenuCtx.Provider>
  );
}

const mobileItem =
  "flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-base hover:bg-accent";

export function ActionMenuItem({
  onSelect,
  destructive = false,
  hint,
  icon,
  children,
}: {
  onSelect: () => void;
  /** Destructive actions go last and read red (Remove). */
  destructive?: boolean;
  /** Tooltip with the longer explanation. */
  hint?: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  const { mobile, close } = useContext(MenuCtx);
  if (mobile) {
    return (
      <button
        type="button"
        title={hint}
        onClick={() => {
          onSelect();
          close();
        }}
        className={cn(mobileItem, destructive && "text-destructive", focusRing)}
      >
        {icon}
        {children}
      </button>
    );
  }
  return (
    <DropdownMenuItem
      variant={destructive ? "destructive" : "default"}
      title={hint}
      onClick={onSelect}
      className="min-h-8 px-2"
    >
      {icon}
      {children}
    </DropdownMenuItem>
  );
}

export function ActionMenuSeparator() {
  const { mobile } = useContext(MenuCtx);
  return mobile ? (
    <div role="separator" className="mx-1 my-1 h-px bg-border" />
  ) : (
    <DropdownMenuSeparator />
  );
}

/** Highlight colours as one row of swatches. `value` = the highlight's
 * current colour (checked); `preferred` = the account default (ringed). */
export function ActionMenuColors({
  value,
  preferred,
  onPick,
}: {
  value: HighlightColor | null;
  preferred: HighlightColor;
  onPick: (color: HighlightColor) => void;
}) {
  const { mobile, close } = useContext(MenuCtx);
  const { t } = useTranslation();
  const name = (c: HighlightColor) => t("menu.highlight", { color: t(`menu.colors.${c}`) });
  const swatch = (c: HighlightColor, big: boolean) => (
    <span
      aria-hidden
      className={cn(
        "flex items-center justify-center rounded-full",
        big ? "size-8" : "size-5",
        c === preferred ? "ring-2 ring-foreground/40" : "ring-1 ring-foreground/15",
      )}
      style={{ backgroundColor: HIGHLIGHT_SWATCH[c] }}
    >
      {c === value && <Check className={cn("text-black/70", big ? "size-4" : "size-3")} />}
    </span>
  );
  if (mobile) {
    return (
      <div role="group" aria-label={t("menu.colour")} className="flex justify-between gap-1 px-1 py-1">
        {HIGHLIGHT_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={name(c)}
            aria-pressed={c === value}
            onClick={() => {
              onPick(c);
              close();
            }}
            className={cn("flex size-11 items-center justify-center rounded-full", focusRing)}
          >
            {swatch(c, true)}
          </button>
        ))}
      </div>
    );
  }
  return (
    <MenuPrimitive.RadioGroup
      value={value}
      aria-label={t("menu.colour")}
      className="flex items-center justify-between gap-0.5 px-1 py-0.5"
    >
      {HIGHLIGHT_COLORS.map((c) => (
        <MenuPrimitive.RadioItem
          key={c}
          value={c}
          label={name(c)}
          aria-label={name(c)}
          title={name(c)}
          closeOnClick
          onClick={() => onPick(c)}
          className="flex size-7 cursor-default items-center justify-center rounded-md outline-none data-highlighted:bg-accent"
        >
          {swatch(c, false)}
        </MenuPrimitive.RadioItem>
      ))}
    </MenuPrimitive.RadioGroup>
  );
}

/** A small form tied to the same anchor (the annotation composer): a
 * popover on desktop, a drawer on the phone. Focus lands in `initialFocus`. */
export function AnchoredPanel({
  open,
  onOpenChange,
  anchor,
  mobile,
  label,
  initialFocus,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean, keyboard: boolean) => void;
  anchor: VirtualAnchor | null;
  mobile: boolean;
  label: string;
  initialFocus?: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  if (mobile) {
    return (
      <Drawer
        open={open}
        modal={false}
        showSwipeHandle
        onOpenChange={(next, details) => {
          if (!next && keepsOpen(details)) return;
          onOpenChange(next, byKeyboard(details.event));
        }}
      >
        <DrawerContent {...{ [SELECTION_UI_ATTR]: "" }} initialFocus={initialFocus} finalFocus={false}>
          <DrawerTitle className="sr-only">{label}</DrawerTitle>
          <div className="flex flex-col gap-2 px-4 pt-1 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
            {children}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }
  return (
    <Popover
      open={open}
      onOpenChange={(next, details) => onOpenChange(next, byKeyboard(details.event))}
    >
      <PopoverContent
        anchor={anchor}
        side="top"
        sideOffset={8}
        aria-label={label}
        initialFocus={initialFocus}
        finalFocus={false}
        {...{ [SELECTION_UI_ATTR]: "" }}
        className="w-72"
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}
