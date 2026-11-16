import type { ScriptureRef } from "@biblestdy/shared";
import { createContext } from "react";

/** What a note's chips can do outside the editor (#160). */
export type RefContextValue = {
  /** "Read here": opens the reference in the reader (in `translationId`
   * when given — "Read in WEB"). */
  onRead?: (ref: ScriptureRef, translationId?: string) => void;
  /** Phone build: 44px targets, the verse picker as a drawer. */
  mobile: boolean;
};

export const ScriptureRefContext = createContext<RefContextValue>({ mobile: false });
