// Device reads can take seconds on a cold cache; show the frame immediately.
export default function Loading() {
  return (
    <div className="stack-lg" aria-busy="true" aria-live="polite">
      <div style={{ height: 28, width: 260, maxWidth: "100%", background: "var(--surface-2)", borderRadius: 6 }} />
      <div className="grid cols-3">
        {[0, 1, 2].map((i) => <div key={i} className="card" style={{ height: 180, background: "var(--surface-2)", borderColor: "transparent" }} />)}
      </div>
      <p className="small muted">Loading device data…</p>
    </div>
  );
}
