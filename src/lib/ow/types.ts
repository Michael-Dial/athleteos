// Subset of the Open Wearables (dial203 fork) schemas that AthleteOS reads.
// Field names match /openapi.json exactly; optional fields stay nullable.

export interface OwSource {
  provider: string;
  source: string | null;
  device: string | null;
  device_type: string | null;
  data_source_id: string | null;
  device_id: string | null;
  device_label: string | null;
  device_display_name: string | null;
  device_name: string | null;
  ingestion_route: string | null;
  user_connection_id: string | null;
  original_source_name: string | null;
}

export interface OwPagination {
  next_cursor: string | null;
  previous_cursor: string | null;
  has_more: boolean;
  total_count: number | null;
}

export interface OwPage<T> {
  data: T[];
  pagination: OwPagination;
  metadata?: unknown;
}

export interface OwTimeSeriesSample {
  timestamp: string;
  zone_offset: string | null;
  type: string;
  value: number;
  unit: string;
  source: OwSource | null;
  interval_seconds: number | null;
  period_end: string | null;
  computed_by: string | null;
}

export interface OwStages {
  awake_minutes: number | null;
  light_minutes: number | null;
  deep_minutes: number | null;
  rem_minutes: number | null;
}

export interface OwSleepSummary {
  date: string;
  source: OwSource;
  start_time: string | null;
  end_time: string | null;
  zone_offset: string | null;
  duration_minutes: number | null;
  total_duration_minutes: number | null;
  time_in_bed_minutes: number | null;
  efficiency_percent: number | null;
  stages: OwStages | null;
  interruptions_count: number | null;
  nap_count: number | null;
  avg_heart_rate_bpm: number | null;
  resting_heart_rate_bpm: number | null;
  avg_hrv_sdnn_ms: number | null;
  avg_hrv_rmssd_ms: number | null;
  avg_respiratory_rate: number | null;
  avg_spo2_percent: number | null;
}

export type OwStageType = "in_bed" | "awake" | "sleeping" | "light" | "deep" | "rem" | "unknown";

export interface OwSleepStageInterval {
  stage: OwStageType;
  start_time: string;
  end_time: string;
  vendor_stage: string | null;
}

export interface OwSleepSession {
  id: string;
  start_time: string;
  end_time: string;
  zone_offset: string | null;
  source: OwSource;
  duration_seconds: number;
  sleep_duration_seconds: number | null;
  time_in_bed_seconds: number | null;
  efficiency_percent: number | null;
  stages: OwStages | null;
  sleep_stage_intervals: OwSleepStageInterval[] | null;
  derived_from_stages: {
    latency_minutes: number | null;
    waso_minutes: number;
    awakenings: number;
  } | null;
  is_nap: boolean;
  is_final: boolean;
}

export interface OwWorkout {
  id: string;
  type: string;
  name: string | null;
  start_time: string;
  end_time: string;
  zone_offset: string | null;
  duration_seconds: number | null;
  source: OwSource;
  calories_kcal: number | null;
  distance_meters: number | null;
  avg_heart_rate_bpm: number | null;
  max_heart_rate_bpm: number | null;
  avg_pace_sec_per_km: number | null;
  elevation_gain_meters: number | null;
  average_watts: number | null;
  moving_time_seconds: number | null;
  intensity: string | null;
  has_fit_file: boolean;
}

export interface OwRecoverySummary {
  date: string;
  source: OwSource;
  sleep_duration_seconds: number | null;
  sleep_efficiency_percent: number | null;
  resting_heart_rate_bpm: number | null;
  avg_hrv_sdnn_ms: number | null;
  avg_hrv_rmssd_ms: number | null;
  avg_spo2_percent: number | null;
}

export interface OwDeviceHistoryEntry {
  id: string;
  device_id: string | null;
  data_source_id: string | null;
  action: string;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  actor: string | null;
  reason: string | null;
  created_at: string;
}

export interface OwDevice {
  id: string;
  brand: string | null;
  model_raw: string | null;
  model_display: string | null;
  device_type: string;
  label: string | null;
  is_active: boolean;
  retired_at: string | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  display_name: string;
  data_sources: unknown[];
}

export interface OwConnection {
  id: string;
  provider: string;
  status: "active" | "revoked" | "expired";
  account_type: string | null;
  account_label: string | null;
  device_label: string | null;
  display_label: string;
  last_synced_at: string | null;
  live_sync_mode: string | null;
  rest_pull: boolean;
  created_at: string;
}

export interface OwProvider {
  provider: string;
  name: string;
  has_cloud_api: boolean;
  is_enabled: boolean;
  credentials_configured: boolean;
  icon_url: string | null;
}

export interface OwUser {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  last_synced_at: string | null;
  last_synced_provider: string | null;
  has_active_connection: boolean;
}

export interface OwApplication {
  id: string;
  app_id: string;
  name: string;
  created_at: string;
  app_secret?: string;
}
