import { describe, expect, it } from "vitest";
import { clusterByOverlap } from "./cluster";

describe("clusterByOverlap", () => {
  it("groups multi-device recordings of one session and keeps separate sessions apart", () => {
    const s = (start: number, end: number, id: string) => ({ start, end, id });
    const items = [s(0, 60, "watch"), s(2, 58, "strap"), s(5, 61, "ring"), s(120, 150, "lift"), s(55, 70, "cooldown")];
    const c = clusterByOverlap(items, (x) => x);
    expect(c.map((g) => g.map((x) => x.id).sort())).toEqual([["cooldown", "ring", "strap", "watch"].filter((x) => x !== "cooldown"), ["cooldown"], ["lift"]].map((g) => g.sort()));
  });
});
