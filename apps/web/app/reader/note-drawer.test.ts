import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NOTE_PEEK, passageInset, peekPoint, returnsTo } from "./note-drawer";

describe("phone note drawer snaps (#215)", () => {
  it("peeks at 45% on a phone; a paged sheet keeps just the bar", () => {
    expect(peekPoint(true, false)).toBe(0.45);
    expect(peekPoint(true, true)).toBe(NOTE_PEEK);
    expect(peekPoint(false, true)).toBe("7.5rem");
    expect(peekPoint(false, false)).toBe("4.5rem");
  });
  it("puts the passage near the top while the note peeks", () => {
    expect(passageInset(780, false, 16)).toBe(260);
    expect(passageInset(780, true, 16)).toBe(48);
    expect(passageInset(100, true, 16)).toBeCloseTo(33.3, 1);
  });
});

describe("closing returns to the reader's place (#203 rule, phones)", () => {
  it("only when the text is still where the note scrolled it", () => {
    expect(returnsTo(900, { from: 200, to: 900 })).toBe(true);
    expect(returnsTo(901.5, { from: 200, to: 900 })).toBe(true);
    // The reader scrolled meanwhile: stay
    expect(returnsTo(1300, { from: 200, to: 900 })).toBe(false);
    // Nothing moved on opening: nothing to undo
    expect(returnsTo(200, { from: 200, to: 200 })).toBe(false);
  });
});

describe("the reader wires the drawer to the snaps (#215)", () => {
  const src = readFileSync(new URL("./paginated-chapter.tsx", import.meta.url), "utf8");
  const drawer = src.slice(src.indexOf("open={!!openNote}"), src.indexOf("</Drawer>", src.indexOf("open={!!openNote}")));
  it("snaps [peek, full], controlled", () => {
    expect(drawer).toMatch(/snapPoints=\{noteSnaps\}/);
    expect(drawer).toMatch(/snapPoint=\{notePeek \? notePeekPoint : NOTE_FULL\}/);
    expect(drawer).toMatch(/onSnapPointChange=/);
  });
  it("at the peek: no overlay, focus not trapped, taps on the text don't close it", () => {
    expect(drawer).toMatch(/modal=\{!notePeek\}/);
    expect(drawer).toMatch(/disablePointerDismissal=\{notePeek\}/);
  });
  it("never spotlights under the full drawer", () => {
    // Going full (drag or "Back to note") ends the spotlight
    expect(src).toMatch(/function unfoldNote\([^)]*\)[\s\S]{0,400}setSpotId\(null\)/);
  });
});
