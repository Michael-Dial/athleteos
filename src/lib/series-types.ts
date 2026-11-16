// Series offered in the explorer and comparison pickers: the physiological
// ones most relevant to training and recovery. Any OW SeriesType works via URL.
export const COMMON_SERIES = [
  ["heart_rate", "Heart rate", "bpm"],
  ["heart_rate_variability_rmssd", "HRV (RMSSD)", "ms"],
  ["heart_rate_variability_sdnn", "HRV (SDNN)", "ms"],
  ["resting_heart_rate", "Resting HR", "bpm"],
  ["respiratory_rate", "Respiratory rate", "br/min"],
  ["oxygen_saturation", "SpO₂", "%"],
  ["skin_temperature", "Skin temperature", "°C"],
  ["skin_temperature_deviation", "Skin temp deviation", "°C"],
  ["body_temperature", "Body temperature", "°C"],
  ["steps", "Steps", "steps"],
  ["active_energy", "Active energy", "kcal"],
  ["vo2_max", "VO₂max", "ml/kg/min"],
  ["weight", "Body mass", "kg"],
  ["garmin_body_battery", "Garmin Body Battery", ""],
  ["garmin_stress_level", "Garmin stress", ""],
  ["power", "Power", "W"],
  ["cadence", "Cadence", "spm"],
  ["speed", "Speed", "m/s"],
] as const;

export function seriesLabel(t: string): string {
  return COMMON_SERIES.find(([k]) => k === t)?.[1] ?? t.replace(/_/g, " ");
}
export function seriesUnit(t: string): string {
  return COMMON_SERIES.find(([k]) => k === t)?.[2] ?? "";
}
export function isSeriesType(t: string): boolean {
  return /^[a-z0-9_]{2,60}$/.test(t);
}
