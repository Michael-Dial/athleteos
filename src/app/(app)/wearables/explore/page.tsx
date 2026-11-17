import type { Metadata } from "next";
import { getCtx } from "@/lib/domain/context";
import { currentUser } from "@/lib/current-user";
import { getTimeseries } from "@/lib/ow/api";
import type { OwTimeSeriesSample } from "@/lib/ow/types";
import { addDays, diffDays, isISODate, todayIn } from "@/lib/dates";
import { deviceKey, deviceName } from "@/lib/stats/sources";
import { COMMON_SERIES, isSeriesType, seriesLabel, seriesUnit } from "@/lib/series-types";
import { errorMessage } from "@/lib/domain/errors";
import { Card, NoDeviceData, Notice, fmt } from "@/components/ui";
import { latestDeviceDay } from "@/lib/domain/latest";
import { OwErrors } from "@/components/setup-banner";
import { TimeChart } from "@/components/charts";
import { IconDownload } from "@/components/icons";

export const metadata: Metadata = { title: "Timeseries" };

const RES = ["raw", "1min", "5min", "15min", "1hour", "1day"] as const;
type Res = (typeof RES)[number];
const SLOTS = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)", "var(--s6)", "var(--s7)", "var(--s8)"];
// Raw rows per day can reach tens of thousands; cap the window per resolution.
const MAX_DAYS: Record<Res, number> = { raw: 2, "1min": 3, "5min": 14, "15min": 31, "1hour": 120, "1day": 730 };

export default async function ExplorePage({ searchParams }: { searchParams: Promise<{ type?: string; start?: string; end?: string; res?: string; relays?: string }> }) {
  const sp = await searchParams;
  const ctx = await getCtx();
  // Data source ids are the backend's own; only an admin sees them (CLAUDE.md).
  const admin = (await currentUser())?.role === "admin";
  const tz = ctx.settings.timezone;
  const today = todayIn(tz);
  const type = sp.type && isSeriesType(sp.type) ? sp.type : "heart_rate";
  const end = isISODate(sp.end) ? sp.end : today;
  const start = isISODate(sp.start) && sp.start <= end ? sp.start : addDays(end, -1);
  const res: Res = (RES as readonly string[]).includes(sp.res ?? "") ? (sp.res as Res) : "15min";
  const relays = sp.relays === "1";
  const span = diffDays(end, start) + 1;
  const tooLong = span > MAX_DAYS[res];

  let data: OwTimeSeriesSample[] = [];
  let err: string | null = null;
  if (!tooLong) {
    try {
      data = await getTimeseries(ctx.ow!, { start, end, types: [type], resolution: res, sourceSelection: "all", includeRedundantRelays: relays || undefined });
    } catch (e) {
      err = errorMessage(e);
    }
  }
  const groups = new Map<string, { name: string; dsid: string | null; src: OwTimeSeriesSample["source"]; pts: [number, number | null][] }>();
  for (const s of data) {
    const k = s.source?.data_source_id ?? deviceKey(s.source);
    const g = groups.get(k) ?? { name: deviceName(s.source), dsid: s.source?.data_source_id ?? null, src: s.source, pts: [] };
    g.pts.push([Date.parse(s.timestamp), s.value]);
    groups.set(k, g);
  }
  const ordered = [...groups.entries()].sort((a, b) => b[1].pts.length - a[1].pts.length);
  disambiguate(ordered.map(([, g]) => g));
  const unit = data[0]?.unit ?? seriesUnit(type);
  const exportEnd = addDays(end, 1); // export end_time is exclusive
  // The default window is the last day; with stale devices that is always
  // empty, so offer the last day that has data instead.
  const latest = data.length || tooLong || err ? null : await latestDeviceDay(ctx);
  const latestHref = latest && latest < start ? `/wearables/explore?type=${type}&start=${latest}&end=${latest}&res=${res}${relays ? "&relays=1" : ""}` : undefined;

  return (
    <div className="stack-lg">
      <Card>
        <form className="form-grid" method="get">
          <label className="field">Series
            <select name="type" defaultValue={type}>
              {COMMON_SERIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              {!COMMON_SERIES.some(([k]) => k === type) && <option value={type}>{type}</option>}
            </select>
          </label>
          <label className="field">From<input type="date" name="start" defaultValue={start} /></label>
          <label className="field">To<input type="date" name="end" defaultValue={end} /></label>
          <label className="field">Resolution
            <select name="res" defaultValue={res}>{RES.map((r) => <option key={r} value={r}>{r} (≤ {MAX_DAYS[r]} d)</option>)}</select>
          </label>
          <label className="row" style={{ fontSize: 13, alignSelf: "end", minHeight: 36 }}><input type="checkbox" name="relays" value="1" defaultChecked={relays} /> Include aggregator relays</label>
          <div className="row" style={{ alignSelf: "end" }}><button className="btn primary" type="submit">Show</button></div>
        </form>
      </Card>
      {tooLong && <Notice>{res} resolution is limited to {MAX_DAYS[res]} days here. Pick a coarser resolution or a shorter window, or use the bulk export below.</Notice>}
      <OwErrors errors={[err]} />
      <Card title={`${seriesLabel(type)}${unit ? ` (${unit})` : ""}`} hint={`${data.length.toLocaleString()} rows · ${groups.size} source${groups.size === 1 ? "" : "s"}${groups.size > 8 ? " · chart shows the 8 with most data" : ""}`}
        action={<a className="btn sm" href={`/api/export/series?types=${type}&start=${start}&end=${exportEnd}&format=csv`}><IconDownload size={14} />Download CSV</a>}>
        <TimeChart ariaLabel={`${seriesLabel(type)} by source`}
          empty={latest ? <NoDeviceData title={`No ${lowerFirst(seriesLabel(type))} in this window`} latest={latest} latestHref={latestHref} /> : undefined} xKind={span <= 1 ? "time" : "datetime"} tz={tz} unit={unit} digits={1} height={300}
          series={ordered.slice(0, 8).map(([k, g], i) => ({ id: k, label: g.name, color: SLOTS[i], kind: "line" as const, points: g.pts }))} />
      </Card>
      {ordered.length > 0 && (
        <Card title="Sources" className="flush">
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>Source</th><th className="num">Rows</th><th className="num">Mean</th><th className="num">Min</th><th className="num">Max</th>{admin && <th>Data source id</th>}</tr></thead>
              <tbody>
                {ordered.map(([k, g], i) => {
                  const vals = g.pts.map((p) => p[1]).filter((v): v is number => v != null);
                  return (
                    <tr key={k}>
                      <td><span className="row" style={{ gap: 6 }}>{i < 8 && <span className="dot" style={{ background: SLOTS[i] }} />}{g.name}</span></td>
                      <td className="num">{g.pts.length.toLocaleString()}</td>
                      <td className="num">{fmt(vals.reduce((a, b) => a + b, 0) / (vals.length || 1), 1)}</td>
                      <td className="num">{fmt(Math.min(...vals), 1)}</td>
                      <td className="num">{fmt(Math.max(...vals), 1)}</td>
                      {admin && <td className="mono">{g.dsid ?? "—"}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

/** "Heart rate" → "heart rate" mid-sentence; leaves "HRV (RMSSD)" and "SpO2" alone. */
function lowerFirst(s: string): string {
  return /^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s;
}

/**
 * One watch can reach the backend twice (directly, and relayed through the
 * phone's health app), so two sources share a device name. Athletes don't see
 * source ids, so name the route instead: "· via Michael's iPhone" for a relay,
 * the app's own source name otherwise, and a number as a last resort.
 */
function disambiguate(groups: { name: string; src: OwTimeSeriesSample["source"] }[]): void {
  const count = new Map<string, number>();
  for (const g of groups) count.set(g.name, (count.get(g.name) ?? 0) + 1);
  for (const g of groups) {
    if ((count.get(g.name) ?? 0) < 2) continue;
    const via = g.src?.original_source_name || g.src?.source;
    if (via && via !== g.name) g.name = `${g.name} · ${g.src?.ingestion_route === "aggregator" ? "via " : ""}${via}`;
  }
  const seen = new Map<string, number>();
  for (const g of groups) {
    const n = (seen.get(g.name) ?? 0) + 1;
    seen.set(g.name, n);
    if (n > 1) g.name = `${g.name} (${n})`;
  }
}
