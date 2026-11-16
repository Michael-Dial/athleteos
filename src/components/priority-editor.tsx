"use client";
import { useState } from "react";
import { IconDownChevron, IconUp } from "./icons";

export interface DeviceOpt {
  key: string;
  name: string;
  count: number;
  last: string | null;
}

/** Ranked list (saved) plus unranked devices; order is posted as JSON keys. */
export function PriorityEditor({ action, metric, ranked, unranked, countLabel }: {
  action: (fd: FormData) => Promise<void>; metric: string; ranked: DeviceOpt[]; unranked: DeviceOpt[]; countLabel: string;
}) {
  const [list, setList] = useState(ranked);
  const [rest, setRest] = useState(unranked);
  const move = (i: number, d: -1 | 1) => setList((l) => {
    const j = i + d;
    if (j < 0 || j >= l.length) return l;
    const n = [...l];
    [n[i], n[j]] = [n[j], n[i]];
    return n;
  });
  const row = (o: DeviceOpt) => <><b>{o.name}</b><span className="small muted"> · {o.count} {countLabel}{o.last ? ` · last ${o.last}` : ""}</span></>;
  return (
    <form action={action} className="stack">
      <input type="hidden" name="metric" value={metric} />
      <input type="hidden" name="order" value={JSON.stringify(list.map((o) => o.key))} />
      <h3>Ranked</h3>
      {list.length === 0 && <p className="small muted">No ranking: the device with the most data is used and labelled “unranked”.</p>}
      <ol className="stack" style={{ margin: 0, paddingLeft: 20 }}>
        {list.map((o, i) => (
          <li key={o.key}>
            <div className="row between">
              <span>{row(o)}</span>
              <span className="row">
                <button type="button" className="btn icon" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${o.name} up`} title="Move up"><IconUp /></button>
                <button type="button" className="btn icon" onClick={() => move(i, 1)} disabled={i === list.length - 1} aria-label={`Move ${o.name} down`} title="Move down"><IconDownChevron /></button>
                <button type="button" className="btn sm" onClick={() => { setList((l) => l.filter((x) => x.key !== o.key)); setRest((r) => [o, ...r]); }}>Unrank</button>
              </span>
            </div>
          </li>
        ))}
      </ol>
      <h3 className="mt-sm">Unranked</h3>
      {rest.length === 0 ? <p className="small muted">Every device with data is ranked.</p> : (
        <ul className="stack" style={{ margin: 0, paddingLeft: 20 }}>
          {rest.map((o) => (
            <li key={o.key}>
              <div className="row between">
                <span>{row(o)}</span>
                <button type="button" className="btn sm" onClick={() => { setRest((r) => r.filter((x) => x.key !== o.key)); setList((l) => [...l, o]); }}>Add to ranking</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="row"><button className="btn primary" type="submit">Save ranking</button></div>
    </form>
  );
}
