import type { OwSource } from "../ow/types";

/** Stable identity of the physical device behind a record. */
export function deviceKey(s: OwSource | null | undefined): string {
  if (!s) return "unknown";
  return s.device_id ?? s.data_source_id ?? `${s.provider}:${s.device ?? s.source ?? "?"}`;
}

/** Human name for the device; always non-empty so no number is shown unlabelled. */
export function deviceName(s: OwSource | null | undefined): string {
  if (!s) return "Unknown source";
  return s.device_label || s.device_display_name || s.device_name || s.device || s.original_source_name || s.provider;
}

export interface Ranked<T> {
  primary: T | null;
  /** Every other device's row, in priority order. Never discarded. */
  others: T[];
  /** True when no device in the priority list had data and a fallback was used. */
  fallback: boolean;
}

/**
 * Order rows by the athlete's device priority for a metric. Devices not in the
 * list follow, alphabetically, and `fallback` is set so the UI can say the
 * shown value comes from an unranked device.
 */
export function rankBySource<T>(
  rows: T[],
  src: (r: T) => OwSource | null | undefined,
  priority: string[],
  /** Order for unranked devices, e.g. most nights of data first. Name order if absent. */
  fallbackOrder: string[] = [],
): Ranked<T> {
  if (!rows.length) return { primary: null, others: [], fallback: false };
  const rank = (r: T): [number, number] => {
    const k = deviceKey(src(r));
    const i = priority.indexOf(k);
    if (i !== -1) return [0, i];
    const j = fallbackOrder.indexOf(k);
    return [1, j === -1 ? Number.MAX_SAFE_INTEGER : j];
  };
  const sorted = [...rows].sort((a, b) => {
    const [ga, ia] = rank(a);
    const [gb, ib] = rank(b);
    if (ga !== gb) return ga - gb;
    if (ia !== ib) return ia - ib;
    return deviceName(src(a)).localeCompare(deviceName(src(b)));
  });
  return { primary: sorted[0], others: sorted.slice(1), fallback: rank(sorted[0])[0] === 1 };
}
