import type { ReactNode } from "react";
import { IconAlert, IconCheck, IconDevice, IconDown, IconMinus } from "./icons";

export function Card({ title, hint, action, children, className = "" }: { title?: ReactNode; hint?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || hint || action) && (
        <div className="card-head">
          <div className="row">{title && <h2>{title}</h2>}{hint && <span className="hint">{hint}</span>}</div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** Every device-derived number carries one of these; a value is never shown without its source. */
export function SourceChip({ name, fallback, title }: { name: string; fallback?: boolean; title?: string }) {
  return (
    <span className={`chip${fallback ? " warn" : ""}`} title={title ?? (fallback ? "Not in your device priority list for this metric: shown because no ranked device had data." : `Source: ${name}`)}>
      <IconDevice size={12} />
      {name}
      {fallback ? " · unranked" : ""}
    </span>
  );
}

export function Stat({ label, value, unit, sub, source }: { label: ReactNode; value: ReactNode; unit?: string; sub?: ReactNode; source?: ReactNode }) {
  return (
    <div className="stack" style={{ gap: 4 }}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}{unit && <span className="unit">{unit}</span>}</div>
      {sub && <div className="stat-sub">{sub}</div>}
      {source && <div>{source}</div>}
    </div>
  );
}

const STATE_TEXT = { ok: "Normal", watch: "Watch", flag: "Flag", nodata: "No data" } as const;
export type UiState = keyof typeof STATE_TEXT;

export function StatePill({ state, label }: { state: UiState; label?: string }) {
  const Icon = state === "ok" ? IconCheck : state === "nodata" ? IconMinus : state === "flag" ? IconDown : IconAlert;
  return (
    <span className={`pill ${state}`}>
      <Icon size={12} strokeWidth={2.5} />
      {label ?? STATE_TEXT[state]}
    </span>
  );
}

export function Notice({ kind = "warn", children }: { kind?: "warn" | "bad" | "info"; children: ReactNode }) {
  return (
    <div className={`notice ${kind === "info" ? "" : kind}`} role={kind === "bad" ? "alert" : "status"}>
      <IconAlert size={16} />
      <div>{children}</div>
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children && <p className="small">{children}</p>}
      {action}
    </div>
  );
}

/** Values from every other device for the same metric and night. */
export function OtherSources({ items, format }: { items: { name: string; value: number | null }[]; format: (v: number) => string }) {
  if (!items.length) return null;
  return (
    <details className="others">
      <summary>{items.length} other device{items.length === 1 ? "" : "s"}</summary>
      <ul className="others-list">
        {items.map((it, i) => (
          <li key={i}><span className="ink2">{it.name}</span><span>{it.value == null ? "—" : format(it.value)}</span></li>
        ))}
      </ul>
    </details>
  );
}

export function fmt(v: number | null | undefined, digits = 0): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export function fmtSigned(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(digits)}`;
}
