import Link from "next/link";
import type { Metadata } from "next";
import { getCtx } from "@/lib/domain/context";
import { METRIC_INFO, PRESETS, fmtPace, zoneSet, type ZoneMetric } from "@/lib/zones";
import { Card, Notice } from "@/components/ui";
import { zoneColor } from "@/components/zone-bars";
import { updateZones } from "../../actions";

export const metadata: Metadata = { title: "Zones" };

export default async function ZonesSettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const sp = await searchParams;
  const ctx = await getCtx();
  const z = ctx.settings.zones;
  const preview = (m: ZoneMetric) => {
    const r = zoneSet(m, ctx.settings);
    if (!r.ok) return <p className="small muted">{r.reason} to build these zones.</p>;
    const fmt = (v: number | null) => (v == null ? "" : m === "pace" ? fmtPace(v) : String(v));
    return (
      <ul className="others-list" style={{ marginTop: 8 }}>
        {r.set.bands.map((b, i) => (
          <li key={b.name}>
            <span className="row" style={{ gap: 6 }}><span className="dot" style={{ background: zoneColor(i, r.set.bands.length), borderRadius: 2 }} />{b.name}</span>
            <span className="ink2">
              {m === "pace"
                ? b.from == null ? `slower than ${fmt(b.to)}` : b.to == null ? `faster than ${fmt(b.from)}` : `${fmt(b.from)}–${fmt(b.to)}`
                : b.from == null ? `≤ ${fmt(b.to)}` : b.to == null ? `> ${fmt(b.from)}` : `${(b.from ?? 0) + 1}–${fmt(b.to)}`}
              {" "}{METRIC_INFO[m].unit}
            </span>
          </li>
        ))}
      </ul>
    );
  };
  const opt = (m: keyof typeof PRESETS) => Object.entries(PRESETS[m]).map(([k, p]) => <option key={k} value={k}>{p.label}</option>);

  return (
    <form action={updateZones} className="stack-lg">
      {sp.saved && <p className="small" style={{ color: "var(--good)" }} role="status">Zones saved.</p>}
      {sp.error && <Notice kind="bad">{sp.error}</Notice>}
      <p className="small muted">Presets scale from your thresholds; “Custom” uses the boundaries you list. Results appear on <Link href="/history/zones">History → Time in zone</Link>.</p>
      <div className="grid cols-2">
        <Card title="Heart rate">
          <div className="form-grid">
            <label className="field">Model<select name="hr.model" defaultValue={z.hr.model}>{opt("hr")}<option value="custom">Custom boundaries</option></select></label>
            <label className="field">LTHR (bpm)<input type="number" name="hr.lthr" defaultValue={z.hr.lthr ?? ""} min={80} max={220} /><span className="help">for the %LTHR model</span></label>
            <label className="field">HRmax (bpm)<input type="number" name="load.hrMax" defaultValue={ctx.settings.load.hrMax} min={120} max={230} /><span className="help">for the %HRmax model and TRIMP</span></label>
            <label className="field wide">Custom upper bounds (bpm)<input name="hr.custom" defaultValue={z.hr.custom.join(", ")} placeholder="e.g. 135, 150, 162, 172" /><span className="help">top of each zone except the last; 3-zone model uses LT1/LT2 from Analysis settings</span></label>
          </div>
          {preview("hr")}
        </Card>
        <Card title="Running pace">
          <div className="form-grid">
            <label className="field">Model<select name="pace.model" defaultValue={z.pace.model}>{opt("pace")}<option value="custom">Custom boundaries</option></select></label>
            <label className="field">Threshold pace (min:sec /km)<input name="pace.threshold" defaultValue={z.pace.thresholdPaceSecPerKm ? fmtPace(z.pace.thresholdPaceSecPerKm) : ""} placeholder="4:05" pattern="\d{1,2}:[0-5]\d" /><span className="help">roughly your 1-hour race pace</span></label>
            <label className="field wide">Custom boundaries (min:sec /km)<input name="pace.custom" defaultValue={z.pace.custom.map(fmtPace).join(", ")} placeholder="e.g. 5:30, 4:50, 4:20, 4:05" /></label>
          </div>
          {preview("pace")}
        </Card>
        <Card title="Running power">
          <div className="form-grid">
            <label className="field">Model<select name="runpower.model" defaultValue={z.runpower.model}>{opt("runpower")}<option value="custom">Custom boundaries</option></select></label>
            <label className="field">Critical power (W)<input type="number" name="runpower.cp" defaultValue={z.runpower.criticalPowerW ?? ""} min={50} max={800} /><span className="help">from the same device you run with</span></label>
            <label className="field wide">Custom upper bounds (W)<input name="runpower.custom" defaultValue={z.runpower.custom.join(", ")} /></label>
          </div>
          {preview("runpower")}
        </Card>
        <Card title="Cycling power">
          <div className="form-grid">
            <label className="field">Model<select name="bikepower.model" defaultValue={z.bikepower.model}>{opt("bikepower")}<option value="custom">Custom boundaries</option></select></label>
            <label className="field">FTP (W)<input type="number" name="bikepower.ftp" defaultValue={z.bikepower.ftpW ?? ""} min={50} max={600} /></label>
            <label className="field wide">Custom upper bounds (W)<input name="bikepower.custom" defaultValue={z.bikepower.custom.join(", ")} /></label>
          </div>
          {preview("bikepower")}
        </Card>
      </div>
      <div className="row"><button className="btn primary" type="submit">Save zones</button></div>
    </form>
  );
}
