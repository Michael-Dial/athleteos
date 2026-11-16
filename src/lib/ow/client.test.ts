import { afterEach, describe, expect, it, vi } from "vitest";
import { buildQuery, owPaginate } from "./client";
import { foldStage, stageTotals } from "./stages";

function page(data: number[], has_more: boolean, next_cursor: string | null) {
  return new Response(JSON.stringify({ data, pagination: { has_more, next_cursor } }), { status: 200 });
}

describe("owPaginate", () => {
  afterEach(() => vi.unstubAllGlobals());
  process.env.OW_API_BASE = "http://ow.test/api/v1";
  process.env.OW_API_KEY = "k";

  it("follows cursors and sends the page limit", async () => {
    const calls: string[] = [];
    const responses = [page([1, 2], true, "c1"), page([3], false, null)];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => { calls.push(url); return responses.shift()!; }));
    const out = await owPaginate<number>("/users/u/timeseries", { types: ["a", "b"] }, 1000);
    expect(out).toEqual([1, 2, 3]);
    expect(calls[0]).toContain("limit=1000");
    expect(calls[0]).toContain("types=a&types=b");
    expect(calls[1]).toContain("cursor=c1");
  });

  it("throws on has_more without a cursor instead of stopping silently", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => page([1], true, null)));
    await expect(owPaginate("/x", {}, 1000)).rejects.toThrow(/has_more with no next_cursor/);
  });

  it("throws on a repeated cursor", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => page([1], true, "same")));
    await expect(owPaginate("/x", {}, 1000)).rejects.toThrow(/repeated cursor/);
  });
});

describe("buildQuery", () => {
  it("skips empty values and repeats arrays", () => {
    expect(buildQuery({ a: 1, b: null, c: "", d: ["x", "y"], e: false })).toBe("?a=1&d=x&d=y&e=false");
  });
});

describe("stage folding", () => {
  it("maps PSG vendor stages onto the OW alphabet", () => {
    expect(foldStage({ stage: "unknown", vendor_stage: "N3" })).toBe("deep");
    expect(foldStage({ stage: "unknown", vendor_stage: "Stage N1" })).toBe("light");
    expect(foldStage({ stage: "sleeping", vendor_stage: "R" })).toBe("rem");
    expect(foldStage({ stage: "light", vendor_stage: null })).toBe("light");
    expect(foldStage({ stage: "light", vendor_stage: "garbage" })).toBe("light");
  });
  it("totals minutes and ignores in_bed context spans", () => {
    const t = stageTotals([
      { stage: "in_bed", start_time: "2026-01-01T00:00:00Z", end_time: "2026-01-01T08:00:00Z", vendor_stage: null },
      { stage: "deep", start_time: "2026-01-01T01:00:00Z", end_time: "2026-01-01T01:30:00Z", vendor_stage: null },
      { stage: "unknown", start_time: "2026-01-01T01:30:00Z", end_time: "2026-01-01T02:00:00Z", vendor_stage: "N2" },
    ]);
    expect(t.deep).toBe(30);
    expect(t.light).toBe(30);
  });
});
