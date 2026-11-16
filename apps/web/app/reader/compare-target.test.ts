import { describe, expect, it } from "vitest";
import { compareTargetOr, noteCompareFocus, noteCompareSelection, pickCompareTarget, snapshotCompareTarget } from "./compare-target";

const at = (v: number) => ({ translationId: "web", book: "JHN", chapter: 3, startVerse: v, endVerse: v });

describe("compare target fallback", () => {
  it("selection, then focused verse, then first on the page", () => {
    expect(pickCompareTarget({ selection: at(16), focused: at(5), first: at(1) })).toEqual(at(16));
    expect(pickCompareTarget({ selection: null, focused: at(5), first: at(1) })).toEqual(at(5));
    expect(pickCompareTarget({ first: at(1) })).toEqual(at(1));
    expect(pickCompareTarget({})).toBeNull();
  });

  it("a snapshot keeps what was live as the surface opened", () => {
    noteCompareFocus("a", at(5));
    noteCompareSelection("a", at(16));
    snapshotCompareTarget();
    // Focus moves into the palette: the reader lets go
    noteCompareSelection("a", null);
    noteCompareFocus("a", null);
    expect(compareTargetOr(at(1))).toEqual(at(16));
    snapshotCompareTarget();
    expect(compareTargetOr(at(1))).toEqual(at(1));
  });
});
