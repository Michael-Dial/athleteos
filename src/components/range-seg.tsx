import Link from "next/link";

export function RangeSeg({ base, days, options = [30, 60, 90, 180], extra = "" }: { base: string; days: number; options?: number[]; extra?: string }) {
  return (
    <div className="seg">
      {options.map((d) => <Link key={d} href={`${base}?days=${d}${extra}`} className={d === days ? "on" : ""}>{d} d</Link>)}
    </div>
  );
}

export function pickDays(v: string | undefined, options = [30, 60, 90, 180], dflt = 60): number {
  const n = Number(v);
  return options.includes(n) ? n : dflt;
}
