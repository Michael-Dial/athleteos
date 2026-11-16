"use client";
import { useRef } from "react";

/** RPE picker that saves on change; the surrounding form posts to a server action. */
export function RateSelect({ action, hidden, value, label }: { action: (fd: FormData) => Promise<void>; hidden: Record<string, string>; value: number | null; label: string }) {
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form action={action} ref={ref}>
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <label className="sr-only" htmlFor={`rpe-${hidden.key}`}>{label}</label>
      <select id={`rpe-${hidden.key}`} name="rpe" defaultValue={value ?? ""} onChange={() => ref.current?.requestSubmit()}
        style={{ minHeight: 28, padding: "2px 6px", width: 64, fontSize: 13 }}>
        <option value="">—</option>
        {Array.from({ length: 11 }, (_, i) => <option key={i} value={i}>{i}</option>)}
      </select>
    </form>
  );
}
