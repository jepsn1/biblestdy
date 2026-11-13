import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn with the type scale (#66)", () => {
  it("keeps a scale size next to a text colour", () => {
    expect(cn("text-meta text-muted-foreground")).toBe("text-meta text-muted-foreground");
  });
  it("lets a later scale size win over an earlier one", () => {
    expect(cn("text-control font-medium", "text-list")).toBe("font-medium text-list");
  });
});
