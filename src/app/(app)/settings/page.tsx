import type { Metadata } from "next";
import { getCtx } from "@/lib/domain/context";
import { Card, Notice } from "@/components/ui";
import { renameAthlete, updateSettings } from "../actions";

export const metadata: Metadata = { title: "Settings" };

function N({ name, label, value, help, step = 1, min, max }: { name: string; label: string; value: number; help?: string; step?: number; min?: number; max?: number }) {
  return (
    <label className="field">{label}
      <input type="number" name={name} defaultValue={value} step={step} min={min} max={max} required />
      {help && <span className="help">{help}</span>}
    </label>
  );
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const sp = await searchParams;
  const ctx = await getCtx();
  const s = ctx.settings;
  return (
    <div className="stack-lg">
      {sp.saved && <p className="small" style={{ color: "var(--good)" }} role="status">Settings saved.</p>}
      {sp.error && <Notice kind="bad">{sp.error}</Notice>}

      <Card title="Athlete">
        <form action={renameAthlete} className="row" style={{ alignItems: "flex-end" }}>
          <label className="field" style={{ maxWidth: 280 }}>Name<input name="name" defaultValue={ctx.athlete.name} /></label>
          <button className="btn" type="submit">Rename</button>
        </form>
      </Card>

      <form action={updateSettings} className="stack-lg">
        <input type="hidden" name="$bools" value="ow.includeRedundantRelays,load.trimpFallback" />
        <Card title="General">
          <div className="form-grid">
            <label className="field">Timezone<input name="timezone" defaultValue={s.timezone} /><span className="help">IANA name; defines calendar days</span></label>
            <N name="ow.cacheTtlSeconds" label="Cache: recent data (s)" value={s.ow.cacheTtlSeconds} min={0} max={3600} help="0 disables caching" />
            <N name="ow.historicalCacheTtlSeconds" label="Cache: settled months (s)" value={s.ow.historicalCacheTtlSeconds} min={0} max={86400} />
            <label className="row" style={{ fontSize: 13, alignSelf: "end", minHeight: 36 }}><input type="checkbox" name="ow.includeRedundantRelays" defaultChecked={s.ow.includeRedundantRelays} /> Include aggregator relays of directly connected makers</label>
          </div>
        </Card>

        <Card title="HRV" hint="Plews et al. 2012/2013; aggregated on ln(RMSSD)">
          <div className="form-grid">
            <N name="hrv.rollingDays" label="Rolling window (days)" value={s.hrv.rollingDays} min={3} max={14} />
            <N name="hrv.baselineDays" label="Baseline window (days)" value={s.hrv.baselineDays} min={14} max={120} />
            <N name="hrv.swcSd" label="SWC (× baseline SD)" value={s.hrv.swcSd} step={0.05} min={0.1} max={2} />
            <N name="hrv.minBaselineN" label="Min nights for a baseline" value={s.hrv.minBaselineN} min={5} max={60} />
          </div>
        </Card>

        <Card title="Individual baselines" hint="resting HR, sleep, wellness">
          <div className="form-grid">
            <N name="baselines.windowDays" label="Window (days)" value={s.baselines.windowDays} min={7} max={120} />
            <N name="baselines.minN" label="Min observations" value={s.baselines.minN} min={3} max={60} />
            <N name="baselines.zFlag" label="Flag at |z| ≥" value={s.baselines.zFlag} step={0.1} min={0.5} max={3} />
          </div>
        </Card>

        <Card title="Training load">
          <div className="form-grid">
            <label className="field">Load unit
              <select name="load.method" defaultValue={s.load.method}>
                <option value="srpe">sRPE (RPE × min)</option><option value="trimp">Banister TRIMP (avg HR)</option><option value="duration">Duration (min)</option>
              </select>
            </label>
            <label className="row" style={{ fontSize: 13, alignSelf: "end", minHeight: 36 }}><input type="checkbox" name="load.trimpFallback" defaultChecked={s.load.trimpFallback} /> sRPE mode: use TRIMP for unrated device sessions (mixes units)</label>
            <label className="field">ACWR model
              <select name="load.acwrModel" defaultValue={s.load.acwrModel}><option value="ewma">EWMA (Williams 2017)</option><option value="rolling">Rolling, uncoupled (Lolli 2019)</option></select>
            </label>
            <N name="load.acuteDays" label="Acute window (days)" value={s.load.acuteDays} min={3} max={14} />
            <N name="load.chronicDays" label="Chronic window (days)" value={s.load.chronicDays} min={14} max={56} />
            <N name="load.hrRest" label="HR rest (bpm)" value={s.load.hrRest} min={25} max={100} help="for TRIMP" />
            <N name="load.hrMax" label="HR max (bpm)" value={s.load.hrMax} min={120} max={230} />
            <label className="field">TRIMP coefficients
              <select name="load.trimpSex" defaultValue={s.load.trimpSex}><option value="male">Male (0.64, 1.92)</option><option value="female">Female (0.86, 1.67)</option></select>
            </label>
          </div>
        </Card>

        <Card title="Which device workouts count as training">
          <div className="form-grid">
            <N name="training.minDurationMin" label="Ignore shorter than (min)" value={s.training.minDurationMin} min={0} max={120} />
            <N name="training.maxDurationHours" label="Ignore longer than (h)" value={s.training.maxDurationHours} min={1} max={48} step={0.5} help="overnight captures logged as workouts" />
            <N name="training.sameSessionOverlap" label="Same-session overlap" value={s.training.sameSessionOverlap} min={0.1} max={1} step={0.05} help="fraction of the shorter recording" />
            <label className="field wide">Exclude workout types<input name="training.excludeTypes" defaultValue={s.training.excludeTypes.join(", ")} placeholder="e.g. chores, lifestyle, meditation" /><span className="help">OW type names, comma-separated. Exclude whole devices on the Device priority tab.</span></label>
          </div>
        </Card>

        <Card title="Device comparison" hint="lag search: OW has no cross-device clock offset">
          <div className="form-grid">
            <N name="compare.epochSeconds" label="Epoch (s)" value={s.compare.epochSeconds} min={1} max={3600} />
            <N name="compare.lagToleranceSeconds" label="Lag tolerance ± (s)" value={s.compare.lagToleranceSeconds} min={0} max={3600} />
            <N name="compare.lagStepSeconds" label="Lag step (s)" value={s.compare.lagStepSeconds} min={1} max={600} />
            <N name="compare.minPairs" label="Min paired epochs" value={s.compare.minPairs} min={5} max={10000} />
          </div>
        </Card>

        <Card title="Readiness" hint="weights 0 drop a pillar from the index">
          <div className="form-grid">
            <N name="readiness.weights.hrv" label="Weight: HRV" value={s.readiness.weights.hrv} step={0.1} min={0} max={5} />
            <N name="readiness.weights.rhr" label="Weight: resting HR" value={s.readiness.weights.rhr} step={0.1} min={0} max={5} />
            <N name="readiness.weights.sleep" label="Weight: sleep" value={s.readiness.weights.sleep} step={0.1} min={0} max={5} />
            <N name="readiness.weights.wellness" label="Weight: wellness" value={s.readiness.weights.wellness} step={0.1} min={0} max={5} />
            <N name="readiness.weights.load" label="Weight: load" value={s.readiness.weights.load} step={0.1} min={0} max={5} />
            <N name="readiness.acwrLow" label="ACWR band low" value={s.readiness.acwrLow} step={0.05} min={0} max={2} />
            <N name="readiness.acwrHigh" label="ACWR band high" value={s.readiness.acwrHigh} step={0.05} min={0.5} max={3} />
            <N name="readiness.sleepTargetMin" label="Sleep target (min)" value={s.readiness.sleepTargetMin} min={180} max={720} step={5} />
            <N name="readiness.watchZ" label="“Watch” at |z| ≥" value={s.readiness.watchZ} step={0.1} min={0.1} max={2} />
          </div>
        </Card>
        <div className="row"><button className="btn primary" type="submit">Save settings</button></div>
      </form>
    </div>
  );
}
