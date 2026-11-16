import type { Settings } from "./settings";

// Zone sets per metric. A set is a list of bands with boundaries expressed in
// the unit the samples arrive in (bpm, m/s, W), built from the athlete's
// thresholds and a preset, or from custom boundaries they enter.

export const ZONE_METRICS = ["hr", "pace", "runpower", "bikepower"] as const;
export type ZoneMetric = (typeof ZONE_METRICS)[number];

export const METRIC_INFO: Record<ZoneMetric, { label: string; unit: string; sports: "all" | "run" | "ride"; series: string[] }> = {
  hr: { label: "Heart rate", unit: "bpm", sports: "all", series: ["heart_rate"] },
  pace: { label: "Running pace", unit: "/km", sports: "run", series: ["speed"] },
  // Garmin and Strava send running power as `power`; Apple as `running_power`.
  runpower: { label: "Running power", unit: "W", sports: "run", series: ["power", "running_power"] },
  bikepower: { label: "Cycling power", unit: "W", sports: "ride", series: ["power"] },
};

export interface Band {
  name: string;
  /** Lower/upper bound in display units (bpm, sec/km, W); null = open-ended. */
  from: number | null;
  to: number | null;
}

export interface ZoneSet {
  metric: ZoneMetric;
  model: string;
  modelLabel: string;
  bands: Band[];
  /** Ascending boundaries in sample units, for timeInBands. */
  upper: number[];
  /** Turn a raw sample into the banded value (pace bands on speed so faster = higher). */
  ignoreBelow: number | null;
}

export type ZoneSetResult = { ok: true; set: ZoneSet } | { ok: false; reason: string; settingsKey: string };

// Presets: fractions of the athlete's threshold, as band upper bounds.
export const PRESETS = {
  hr: {
    lthr5: { label: "5 zones, % of LTHR", needs: "lthr", upper: [0.85, 0.9, 0.95, 1.0], names: ["Z1 Recovery", "Z2 Aerobic", "Z3 Tempo", "Z4 Threshold", "Z5 Above threshold"] },
    hrmax5: { label: "5 zones, % of HRmax", needs: "hrmax", upper: [0.6, 0.7, 0.8, 0.9], names: ["Z1", "Z2", "Z3", "Z4", "Z5"] },
    three: { label: "3 zones, LT1/LT2", needs: "lt", upper: [], names: ["Z1 below LT1", "Z2 LT1–LT2", "Z3 above LT2"] },
  },
  // Pace bands as fractions of threshold *speed* (faster = higher).
  pace: {
    threshold5: { label: "5 zones, % of threshold speed", needs: "thresholdPace", upper: [0.78, 0.88, 0.95, 1.01], names: ["Z1 Easy", "Z2 Aerobic", "Z3 Tempo", "Z4 Threshold", "Z5 Faster than threshold"] },
  },
  runpower: {
    cp5: { label: "5 zones, % of critical power", needs: "cp", upper: [0.8, 0.9, 1.0, 1.15], names: ["Z1 Easy", "Z2 Moderate", "Z3 Threshold", "Z4 Interval", "Z5 Repetition"] },
  },
  bikepower: {
    ftp7: { label: "7 levels, % of FTP", needs: "ftp", upper: [0.55, 0.75, 0.9, 1.05, 1.2, 1.5], names: ["L1 Active recovery", "L2 Endurance", "L3 Tempo", "L4 Threshold", "L5 VO₂max", "L6 Anaerobic", "L7 Neuromuscular"] },
  },
} as const;

export function fmtPace(secPerKm: number | null): string {
  if (secPerKm == null || !Number.isFinite(secPerKm)) return "—";
  const s = Math.round(secPerKm);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function parsePace(v: string): number | null {
  const m = /^(\d{1,2}):([0-5]\d)$/.exec(v.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function bandsFrom(upper: number[], names: readonly string[] | string[]): Band[] {
  return upper.concat([Infinity]).map((u, i) => ({
    name: names[i] ?? `Z${i + 1}`,
    from: i === 0 ? null : upper[i - 1],
    to: Number.isFinite(u) ? u : null,
  }));
}

/** Build the configured zone set for a metric, or say which threshold is missing. */
export function zoneSet(metric: ZoneMetric, s: Settings): ZoneSetResult {
  const z = s.zones[metric];
  const custom = z.model === "custom";
  const r1 = (x: number) => Math.round(x);
  if (metric === "hr") {
    const hz = s.zones.hr;
    let upper: number[];
    let names: readonly string[];
    if (custom) {
      if (hz.custom.length === 0) return { ok: false, reason: "Enter custom heart-rate boundaries", settingsKey: "zones.hr.custom" };
      upper = [...hz.custom].sort((a, b) => a - b); names = upper.concat([0]).map((_, i) => `Z${i + 1}`);
    } else if (hz.model === "three") {
      const { lt1Hr, lt2Hr } = s.intensity;
      if (lt1Hr == null || lt2Hr == null) return { ok: false, reason: "Set LT1 and LT2 heart rates", settingsKey: "intensity.lt1Hr" };
      upper = [lt1Hr, lt2Hr]; names = PRESETS.hr.three.names;
    } else if (hz.model === "lthr5") {
      if (hz.lthr == null) return { ok: false, reason: "Set your lactate-threshold heart rate (LTHR)", settingsKey: "zones.hr.lthr" };
      upper = PRESETS.hr.lthr5.upper.map((f) => r1(f * hz.lthr!)); names = PRESETS.hr.lthr5.names;
    } else {
      upper = PRESETS.hr.hrmax5.upper.map((f) => r1(f * s.load.hrMax)); names = PRESETS.hr.hrmax5.names;
    }
    const label = custom ? "Custom" : PRESETS.hr[hz.model as keyof typeof PRESETS.hr].label;
    return { ok: true, set: { metric, model: hz.model, modelLabel: label, bands: bandsFrom(upper, names), upper, ignoreBelow: 30 } };
  }
  if (metric === "pace") {
    const pz = s.zones.pace;
    // Pace bands are banded on speed (m/s) so "higher = harder" like the others.
    let speeds: number[];
    let names: readonly string[];
    if (custom) {
      if (pz.custom.length === 0) return { ok: false, reason: "Enter custom pace boundaries", settingsKey: "zones.pace.custom" };
      speeds = pz.custom.map((p) => 1000 / p).sort((a, b) => a - b); names = speeds.concat([0]).map((_, i) => `Z${i + 1}`);
    } else {
      if (pz.thresholdPaceSecPerKm == null) return { ok: false, reason: "Set your threshold pace", settingsKey: "zones.pace.thresholdPaceSecPerKm" };
      const v = 1000 / pz.thresholdPaceSecPerKm;
      speeds = PRESETS.pace.threshold5.upper.map((f) => f * v); names = PRESETS.pace.threshold5.names;
    }
    // Display pace bounds (sec/km): band from slower to faster pace.
    const bands = speeds.concat([Infinity]).map((u, i) => ({
      name: names[i] ?? `Z${i + 1}`,
      from: i === 0 ? null : Math.round(1000 / speeds[i - 1]),
      to: Number.isFinite(u) ? Math.round(1000 / u) : null,
    }));
    // Below 1.0 m/s (16:40/km) is standing or walking breaks, not running pace.
    return { ok: true, set: { metric, model: pz.model, modelLabel: custom ? "Custom" : PRESETS.pace.threshold5.label, bands, upper: speeds, ignoreBelow: 1.0 } };
  }
  const isRun = metric === "runpower";
  const pz = isRun ? s.zones.runpower : s.zones.bikepower;
  const thr = isRun ? s.zones.runpower.criticalPowerW : s.zones.bikepower.ftpW;
  const preset = isRun ? PRESETS.runpower.cp5 : PRESETS.bikepower.ftp7;
  let upper: number[];
  let names: readonly string[];
  if (custom) {
    if (pz.custom.length === 0) return { ok: false, reason: `Enter custom ${isRun ? "running" : "cycling"} power boundaries`, settingsKey: `zones.${metric}.custom` };
    upper = [...pz.custom].sort((a, b) => a - b); names = upper.concat([0]).map((_, i) => `Z${i + 1}`);
  } else {
    if (thr == null) return { ok: false, reason: isRun ? "Set your running critical power (CP)" : "Set your FTP", settingsKey: isRun ? "zones.runpower.criticalPowerW" : "zones.bikepower.ftpW" };
    upper = preset.upper.map((f) => r1(f * thr)); names = preset.names;
  }
  // Running: 0 W means stopped. Cycling: zeros are coasting and stay in L1, as power software conventionally counts them.
  return { ok: true, set: { metric, model: pz.model, modelLabel: custom ? "Custom" : preset.label, bands: bandsFrom(upper, names), upper, ignoreBelow: isRun ? 1 : null } };
}
