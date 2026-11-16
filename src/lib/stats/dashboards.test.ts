import { describe, expect, it } from "vitest";
import { classify, timeInZones } from "./zones";
import { clockFromNoon, midpointFromNoon, minutesFromNoon, timingStats } from "./sleep-timing";
import { assessNight } from "./illness";
import { addDays } from "../dates";

describe("intensity zones", () => {
  it("credits each sample until the next, capping gaps", () => {
    const t0 = 0;
    const s = [{ t: t0, hr: 120 }, { t: t0 + 60_000, hr: 160 }, { t: t0 + 120_000, hr: 180 }, { t: t0 + 1_000_000, hr: 130 }];
    const z = timeInZones(s, { z1Max: 140, z2Max: 170 }, 120, 60);
    expect(z).toEqual([60 + 60, 60, 120]); // 120: gap to next capped at 120 s; last sample 60 s
  });
  it("never credits time past the end of the recording", () => {
    // 1-min buckets for a 64.5-min session: 65 buckets, the last one half-covered.
    const s = Array.from({ length: 66 }, (_, i) => ({ t: i * 60_000, hr: 130 }));
    const z = timeInZones(s, { z1Max: 140, z2Max: 170 }, 120, 60, { start: 0, end: 64.5 * 60_000 });
    expect(z[0]).toBeCloseTo(64.5 * 60, 6);
  });
  it("Polarization-Index matches Treff et al.'s definition", () => {
    const pol = classify([80, 5, 15]);
    expect(pol.pi).toBeCloseTo(Math.log10((0.8 / 0.05) * 0.15 * 100), 10);
    expect(pol.pattern).toBe("polarized");
    expect(classify([75, 20, 5]).pattern).toBe("pyramidal");
    expect(classify([30, 60, 10]).pattern).toBe("threshold");
    expect(classify([0, 0, 0]).pattern).toBe("insufficient");
    // Z2 = 0 uses 0.01 so the index stays finite.
    expect(classify([90, 0, 10]).pi).toBeCloseTo(Math.log10((0.9 / 0.01) * 0.1 * 100), 10);
  });
});

describe("sleep timing", () => {
  it("handles bedtimes either side of midnight", () => {
    const a = minutesFromNoon("2026-11-15T04:50:00Z", "-05:00"); // 23:50 local
    const b = minutesFromNoon("2026-11-16T05:10:00Z", "-05:00"); // 00:10 local
    expect(clockFromNoon((a + b) / 2)).toBe("00:00");
    expect(clockFromNoon(midpointFromNoon("2026-11-16T04:00:00Z", "2026-11-16T12:00:00Z", "-05:00"))).toBe("03:00");
    expect(timingStats([600, 660]).sdMin).toBeCloseTo(42.43, 2);
  });
});

describe("illness signals", () => {
  const cfg = { baselineDays: 28, baselineLagDays: 7, minBaselineN: 14, z: 1.5, minSignals: 2 };
  const build = (base: number, noise: number, today: number, date: string, days = 40) => {
    const m = new Map<string, number>();
    for (let i = 1; i <= days; i++) m.set(addDays(date, -i), base + ((i % 3) - 1) * noise);
    m.set(date, today);
    return m;
  };
  it("fires on RHR up + HRV down and ignores the lagged week", () => {
    const d = "2026-11-16";
    const r = assessNight({ rhr: build(48, 1, 55, d), hrv: build(80, 6, 50, d), rr: build(13, 0.2, 13, d) }, d, cfg);
    expect(r.signals.find((s) => s.key === "rhr")!.firing).toBe(true);
    expect(r.signals.find((s) => s.key === "hrv")!.firing).toBe(true);
    expect(r.signals.find((s) => s.key === "rr")!.firing).toBe(false);
    expect(r.level).toBe("watch");
    expect(assessNight({ rhr: build(48, 1, 55, d), hrv: build(80, 6, 50, d) }, d, cfg, 2).level).toBe("alert");
  });
  it("reports insufficient data without a baseline", () => {
    const d = "2026-11-16";
    expect(assessNight({ rhr: build(48, 1, 55, d, 10) }, d, cfg).level).toBe("insufficient");
  });
});

import { coverage } from "./coverage";
describe("coverage", () => {
  it("counts nights and the longest gap", () => {
    const have = new Set(["2026-11-01", "2026-11-02", "2026-11-06", "2026-11-07"]);
    const c = coverage(have, "2026-11-01", "2026-11-08");
    expect(c.nights).toBe(4);
    expect(c.total).toBe(8);
    expect(c.longestGap).toBe(3);
    expect(c.gapEnd).toBe("2026-11-05");
  });
});
