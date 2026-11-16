import type { OwSleepStageInterval, OwStageType } from "./types";

// OW's stage alphabet has no N1/N2/N3. Manually imported reference recordings
// (PSG, EEG headbands) keep their native label in vendor_stage, so fold those
// onto the OW alphabet using AASM correspondences: N1/N2 -> light, N3 -> deep.
const VENDOR_MAP: Record<string, OwStageType> = {
  w: "awake", wake: "awake", awake: "awake",
  n1: "light", n2: "light", s1: "light", s2: "light", light: "light",
  n3: "deep", n4: "deep", s3: "deep", s4: "deep", sws: "deep", deep: "deep",
  r: "rem", rem: "rem",
  unscored: "unknown", unknown: "unknown", artifact: "unknown", movement: "unknown", mt: "unknown",
};

export function foldStage(iv: Pick<OwSleepStageInterval, "stage" | "vendor_stage">): OwStageType {
  if (iv.vendor_stage) {
    const key = iv.vendor_stage.trim().toLowerCase().replace(/^stage\s*/, "").replace(/\s+/g, "");
    const mapped = VENDOR_MAP[key];
    if (mapped) return mapped;
  }
  return iv.stage;
}

export interface StageTotals {
  awake: number;
  light: number;
  deep: number;
  rem: number;
  sleeping: number;
  unknown: number;
}

/** Minutes per folded stage; 'in_bed' spans are context, not a stage, so skipped. */
export function stageTotals(intervals: OwSleepStageInterval[]): StageTotals {
  const t: StageTotals = { awake: 0, light: 0, deep: 0, rem: 0, sleeping: 0, unknown: 0 };
  for (const iv of intervals) {
    const s = foldStage(iv);
    if (s === "in_bed") continue;
    const mins = (Date.parse(iv.end_time) - Date.parse(iv.start_time)) / 60000;
    if (mins > 0) t[s] += mins;
  }
  return t;
}
