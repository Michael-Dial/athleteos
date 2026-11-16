import { describe, expect, it } from "vitest";
import { mean, sd, tCdf, tCrit, pearson } from "./basic";
import { hrvSeries } from "./hrv";
import { acwr, banisterTrimp, monotonyStrain, srpe } from "./load";
import { agreement, searchLag, type Sample } from "./agreement";
import { rankBySource } from "./sources";
import { zAgainstBaseline } from "./baseline";
import { addDays } from "../dates";
import type { OwSource } from "../ow/types";

describe("basic", () => {
  it("mean/sd", () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(sd([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3);
  });
  it("t distribution matches tables", () => {
    expect(tCdf(0, 10)).toBeCloseTo(0.5, 10);
    expect(tCrit(0.95, 10)).toBeCloseTo(2.228, 3);
    expect(tCrit(0.95, 1000)).toBeCloseTo(1.962, 3);
    expect(tCdf(2.086, 20)).toBeCloseTo(0.975, 3);
  });
  it("pearson", () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 10);
  });
});

describe("hrv", () => {
  const cfg = { rollingDays: 7, baselineDays: 60, swcSd: 0.5, minBaselineN: 14 };
  it("aggregates on ln scale and back-transforms to a geometric mean", () => {
    const days = Array.from({ length: 7 }, (_, i) => ({ date: addDays("2026-01-01", i), rmssd: i % 2 ? 40 : 90 }));
    const s = hrvSeries(days, "2026-01-07", "2026-01-07", cfg);
    const lnMean = (4 * Math.log(90) + 3 * Math.log(40)) / 7;
    expect(s[0].rollingLn).toBeCloseTo(lnMean, 10);
    expect(s[0].rollingMs).toBeCloseTo(Math.exp(lnMean), 10);
    // Geometric mean sits below the arithmetic mean for skewed data.
    expect(s[0].rollingMs!).toBeLessThan((4 * 90 + 3 * 40) / 7);
    expect(s[0].status).toBe("insufficient");
  });
  it("flags a suppressed rolling mean below the SWC band", () => {
    const days = [];
    for (let i = 0; i < 40; i++) days.push({ date: addDays("2026-01-01", i), rmssd: 80 + (i % 3) - 1 });
    for (let i = 40; i < 47; i++) days.push({ date: addDays("2026-01-01", i), rmssd: 50 });
    const end = addDays("2026-01-01", 46);
    const [p] = hrvSeries(days, end, end, cfg);
    expect(p.status).toBe("below");
    expect(p.swcLow!).toBeLessThan(p.baselineLn!);
  });
  it("requires a minimum count in the rolling window", () => {
    const s = hrvSeries([{ date: "2026-01-01", rmssd: 60 }, { date: "2026-01-03", rmssd: 60 }], "2026-01-03", "2026-01-03", cfg);
    expect(s[0].rollingLn).toBeNull();
  });
});

describe("load", () => {
  it("srpe and trimp", () => {
    expect(srpe(6, 60)).toBe(360);
    const t = banisterTrimp(60, 150, 50, 190, "male")!;
    const x = 100 / 140;
    expect(t).toBeCloseTo(60 * x * 0.64 * Math.exp(1.92 * x), 8);
    expect(banisterTrimp(60, 150, 50, 40, "male")).toBeNull();
  });
  it("acwr is null until a full chronic window and ~1 for steady load", () => {
    const daily = new Map<string, number>();
    for (let i = 0; i < 120; i++) daily.set(addDays("2026-01-01", i), 300);
    const pts = acwr(daily, "2026-01-01", "2026-01-01", addDays("2026-01-01", 119), { acuteDays: 7, chronicDays: 28, model: "ewma" });
    expect(pts[0].acwr).toBeNull();
    expect(pts.at(-1)!.acwr!).toBeCloseTo(1, 2);
    const roll = acwr(daily, "2026-01-01", addDays("2026-01-01", 60), addDays("2026-01-01", 60), { acuteDays: 7, chronicDays: 28, model: "rolling" });
    expect(roll[0].acwr).toBeCloseTo(1, 10);
  });
  it("monotony", () => {
    const daily = new Map<string, number>();
    [100, 200, 100, 200, 100, 200, 100].forEach((v, i) => daily.set(addDays("2026-01-01", i), v));
    const m = monotonyStrain(daily, "2026-01-07");
    expect(m.load).toBe(1000);
    expect(m.monotony).toBeCloseTo(mean([100, 200, 100, 200, 100, 200, 100])! / sd([100, 200, 100, 200, 100, 200, 100])!, 10);
  });
});

describe("agreement", () => {
  it("recovers known bias and perfect CCC for identical series", () => {
    const x = Array.from({ length: 100 }, (_, i) => 60 + (i % 17));
    const same = agreement(x, x)!;
    expect(same.bias).toBe(0);
    expect(same.ccc).toBeCloseTo(1, 10);
    const shifted = agreement(x.map((v) => v + 2), x)!;
    expect(shifted.bias).toBeCloseTo(2, 10);
    expect(shifted.ccc!).toBeLessThan(1);
    expect(shifted.mae).toBeCloseTo(2, 10);
  });
  it("TOST declares equivalence only inside the bound", () => {
    const y = Array.from({ length: 200 }, (_, i) => 70 + Math.sin(i) * 10);
    const x = y.map((v, i) => v + 0.5 + ((i * 7919) % 11) / 10 - 0.5);
    expect(agreement(x, y, 3)!.tost!.equivalent).toBe(true);
    expect(agreement(x, y, 0.2)!.tost!.equivalent).toBe(false);
  });
  it("finds an injected clock lag", () => {
    const a: Sample[] = [], b: Sample[] = [];
    const t0 = Date.UTC(2026, 0, 1);
    for (let s = 0; s < 3600; s++) {
      const v = 120 + 30 * Math.sin(s / 90) + 10 * Math.sin(s / 13);
      a.push({ t: t0 + s * 1000, v });
      b.push({ t: t0 + (s + 45) * 1000, v: v + 3 }); // b's clock runs 45 s ahead, +3 bias
    }
    const r = searchLag(a, b, 10_000, 120_000, 5_000, 30);
    expect(r.lagMs).toBe(45_000);
    expect(r.r!).toBeGreaterThan(0.99);
  });
});

describe("sources", () => {
  const src = (id: string, name: string) => ({ device_id: id, device_display_name: name, provider: "x" }) as unknown as OwSource;
  it("orders by priority and flags fallback", () => {
    const rows = [{ s: src("b", "Bravo") }, { s: src("a", "Alpha") }, { s: src("c", "Charlie") }];
    const r = rankBySource(rows, (x) => x.s, ["c", "b"]);
    expect(r.primary!.s.device_id).toBe("c");
    expect(r.others.map((x) => x.s.device_id)).toEqual(["b", "a"]);
    expect(r.fallback).toBe(false);
    const f = rankBySource(rows, (x) => x.s, []);
    expect(f.primary!.s.device_id).toBe("a");
    expect(f.fallback).toBe(true);
  });
});

describe("baseline z", () => {
  it("excludes today from its own baseline", () => {
    const m = new Map<string, number>();
    for (let i = 1; i <= 10; i++) m.set(addDays("2026-02-11", -i), 50 + (i % 2));
    m.set("2026-02-11", 60);
    const z = zAgainstBaseline(m, "2026-02-11", 28, 7);
    expect(z.n).toBe(10);
    expect(z.z!).toBeGreaterThan(5);
  });
});
