import { describe, expect, it } from "vitest";
import { defaultSettings, SettingsSchema } from "./settings";
import { fmtPace, parsePace, zoneSet } from "./zones";
import { timeInBands } from "./stats/zones";

const settings = (patch: object) => SettingsSchema.parse({ ...defaultSettings(), ...patch });

describe("zone sets", () => {
  it("HR %HRmax works with no thresholds set", () => {
    const r = zoneSet("hr", settings({ load: { ...defaultSettings().load, hrMax: 200 } }));
    expect(r.ok && r.set.upper).toEqual([120, 140, 160, 180]);
    expect(r.ok && r.set.bands.length).toBe(5);
  });
  it("asks for the missing threshold instead of guessing", () => {
    const r = zoneSet("bikepower", defaultSettings());
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/FTP/);
    expect(zoneSet("hr", settings({ zones: { hr: { model: "three" } } })).ok).toBe(false);
  });
  it("FTP levels and CP zones scale from the threshold", () => {
    const b = zoneSet("bikepower", settings({ zones: { bikepower: { ftpW: 300 } } }));
    expect(b.ok && b.set.upper).toEqual([165, 225, 270, 315, 360, 450]);
    const r = zoneSet("runpower", settings({ zones: { runpower: { criticalPowerW: 300 } } }));
    expect(r.ok && r.set.upper).toEqual([240, 270, 300, 345]);
    expect(r.ok && r.set.ignoreBelow).toBe(1);
  });
  it("pace bands are speed-banded but displayed as pace", () => {
    const r = zoneSet("pace", settings({ zones: { pace: { thresholdPaceSecPerKm: 240 } } }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.set.upper[3]).toBeCloseTo((1000 / 240) * 1.01, 10);
    expect(r.set.bands[4].from).toBe(Math.round(1000 / ((1000 / 240) * 1.01))); // just under 4:00/km
    expect(r.set.bands[0].from).toBeNull();
  });
  it("custom boundaries are sorted", () => {
    const r = zoneSet("hr", settings({ zones: { hr: { model: "custom", custom: [170, 130, 150] } } }));
    expect(r.ok && r.set.upper).toEqual([130, 150, 170]);
  });
  it("formats and parses pace", () => {
    expect(fmtPace(245)).toBe("4:05");
    expect(parsePace("4:05")).toBe(245);
    expect(parsePace("4:5")).toBeNull();
  });
});

describe("timeInBands", () => {
  it("bands values, ignores rejected samples, assigns boundary values to the lower band", () => {
    const s = [{ t: 0, v: 150 }, { t: 60_000, v: 160 }, { t: 120_000, v: 0 }, { t: 180_000, v: 200 }];
    const out = timeInBands(s, [150, 180], { maxGapSec: 120, lastSampleSec: 60, ignore: (v) => v < 1 });
    expect(out).toEqual([60, 60, 60]);
  });
});
