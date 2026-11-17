import { describe, expect, it } from "vitest";
import { NOT_TEXT, removeLinksTidy, tidyAround } from "./ref-tidy";

/** The sentence with the chip ("[x]") taken out and tidied. */
function without(s: string): string {
  const at = s.indexOf("[x]");
  const before = s.slice(0, at);
  const after = s.slice(at + 3);
  const t = tidyAround(before, after);
  return before.slice(0, before.length - t.before) + after.slice(t.after);
}

describe("tidyAround (#226)", () => {
  it("takes the separator that followed the chip", () => {
    expect(without("See [x], John 3:15")).toBe("See John 3:15");
    expect(without("[x]; Rom 8:1 too")).toBe("Rom 8:1 too");
    expect(without("Rom 5:8; [x], John 3:15")).toBe("Rom 5:8; John 3:15");
  });
  it("takes the separator before it at a stop or the end", () => {
    expect(without("See John 3:15, [x].")).toBe("See John 3:15.");
    expect(without("See John 3:15, [x]")).toBe("See John 3:15");
    expect(without("(cf. Rom 8:1; [x])")).toBe("(cf. Rom 8:1)");
  });
  it("leaves one space between words, none before a stop or at an edge", () => {
    expect(without("Read [x] today")).toBe("Read today");
    expect(without("Read [x].")).toBe("Read.");
    expect(without("[x] says it")).toBe("says it");
    expect(without("Read [x]")).toBe("Read");
  });
  it("drops brackets left empty", () => {
    expect(without("The serpent ([x]) points")).toBe("The serpent points");
    expect(without("The serpent ([x]).")).toBe("The serpent.");
  });
  it("reads a chip beside it as a word", () => {
    expect(tidyAround("See ", `, ${NOT_TEXT}`)).toEqual({ before: 0, after: 2 });
    expect(tidyAround(`${NOT_TEXT}, `, ".")).toEqual({ before: 2, after: 0 });
  });
  it("only ever cuts what touches the chip", () => {
    expect(without("A,B[x]C")).toBe("A,BC");
    expect(tidyAround(`a ${NOT_TEXT}`, ", b")).toEqual({ before: 0, after: 0 });
    expect(tidyAround("", "")).toEqual({ before: 0, after: 0 });
  });
});

describe("removeLinksTidy (#226)", () => {
  const a = "[Joh 3,16](bible:JHN.3.16)";
  it("tidies around each link, line by line", () => {
    const body = `See ${a}, Rom 8.\n${a} first`;
    const second = body.lastIndexOf(a);
    const ranges = [
      { start: 4, end: 4 + a.length },
      { start: second, end: second + a.length },
    ];
    expect(removeLinksTidy(body, ranges)).toBe("See Rom 8.\nfirst");
  });
});
