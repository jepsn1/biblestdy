import type { ScriptureRef } from "@biblestdy/shared";
import { createContext, type ComponentType } from "react";
import type { Hint, modKey } from "~/components/hint";
import type { Popover, PopoverContent } from "~/components/ui/popover";
import type { ScrollArea } from "~/components/ui/scroll-area";
import type { VersePickerProps } from "./verse-picker";

/**
 * The app's overlay components, handed to the editor chunk by the note
 * panel (#160) instead of imported by it: a lazy chunk importing Base UI
 * components splits the reader's first-paint chunks into many small files
 * (+11 KB gz measured). The panel has them loaded already; the verse
 * picker (Dialog/Drawer, not in the first paint) is a lazy chunk of its own.
 */
export type EditorKit = {
  Popover: typeof Popover;
  PopoverContent: typeof PopoverContent;
  VersePicker: ComponentType<VersePickerProps>;
  Hint: typeof Hint;
  modKey: typeof modKey;
  ScrollArea: typeof ScrollArea;
};

/** The chapter open in the reader beside the note (#191): its marks lead
 * the `@` menu. */
export type PagePlace = { translationId: string; book: string; chapter: number };

/** What a note's chips can do outside the editor (#160). */
export type RefContextValue = {
  /** "Read here": opens the reference in the reader (in `translationId`
   * when given — "Read in WEB"). */
  onRead?: (ref: ScriptureRef, translationId?: string) => void;
  /** Phone build: 44px targets, the verse picker as a drawer. */
  mobile: boolean;
  kit: EditorKit;
  /** Absent off the reader (the Notes page): no page marks. */
  page?: PagePlace;
};

export const ScriptureRefContext = createContext<RefContextValue>(null as unknown as RefContextValue);
