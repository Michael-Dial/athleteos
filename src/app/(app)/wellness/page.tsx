import Link from "next/link";
import type { Metadata } from "next";
import { getCtx } from "@/lib/domain/context";
import { requireUser } from "@/lib/current-user";
import { isDue, listDefs, listResponses, listWellness, streak } from "@/lib/domain/questionnaires";
import { addDays, fmtDate, startOfWeek, todayIn } from "@/lib/dates";
import { mean, sd } from "@/lib/stats/basic";
import { Card, Empty, fmt } from "@/components/ui";
import { TimeChart } from "@/components/charts";
import { setQuestionnaireActive } from "../actions";

export const metadata: Metadata = { title: "Check-in" };

export default async function WellnessPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const sp = await searchParams;
  const ctx = await getCtx();
  // Editing a form's definition is an admin task; everyone answers and toggles forms.
  const admin = (await requireUser()).role === "admin";
  const today = todayIn(ctx.settings.timezone);
  const start = addDays(today, -89);
  const [defs, wellness] = await Promise.all([listDefs(ctx.athlete.id, true), listWellness(ctx.athlete.id, start, today)]);
  const info = await Promise.all(
    defs.map(async (d) => {
      const recent = await listResponses(ctx.athlete.id, d.id, addDays(today, -400), today);
      return { d, due: d.active && (await isDue(d, today, startOfWeek(today))), streak: await streak(d.id, today), last: recent.at(-1)?.date ?? null, n: recent.length };
    }),
  );
  const win = ctx.settings.baselines.windowDays;
  const dx = (d: string) => Date.parse(`${d}T12:00:00Z`);
  const wMap = new Map(wellness.map((w) => [w.date, Number(w.composite)]));
  const band: [number, number | null, number | null][] = [];
  for (const w of wellness) {
    const hist: number[] = [];
    for (let i = 1; i <= win; i++) { const v = wMap.get(addDays(w.date, -i)); if (v != null) hist.push(v); }
    const m = hist.length >= ctx.settings.baselines.minN ? mean(hist) : null;
    const s = hist.length >= ctx.settings.baselines.minN ? sd(hist) : null;
    band.push([dx(w.date), m != null && s != null ? m - s : null, m != null && s != null ? m + s : null]);
  }
  const wellnessDef = defs.find((d) => d.kind === "wellness" && d.active);
  const itemKeys = wellnessDef ? wellnessDef.items.filter((i) => i.type === "scale" || i.wellness).map((i) => i) : [];

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div><h1>Check-in</h1><p className="sub">Your morning wellness check and any other forms, with how your answers are trending.</p></div>
        {admin && <Link className="btn" href="/questionnaires/new">New form</Link>}
      </div>
      {sp.saved && <p className="small" style={{ color: "var(--good)" }}>Saved “{sp.saved}”.</p>}

      <Card className="flush" title="Forms">
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Form</th><th>Schedule</th><th>Status</th><th className="num">Streak</th><th>Last answered</th><th className="num">Responses</th><th /></tr></thead>
            <tbody>
              {info.map(({ d, due, streak: st, last, n }) => (
                <tr key={d.id} style={d.active ? undefined : { opacity: 0.6 }}>
                  <td><Link href={`/wellness/${d.slug}`}><b>{d.name}</b></Link>{d.kind === "wellness" && <span className="chip" style={{ marginLeft: 6 }}>feeds readiness</span>}<div className="small muted">{d.description}</div></td>
                  <td>{d.schedule}</td>
                  <td>{!d.active ? <span className="pill nodata">Inactive</span> : due ? <span className="pill watch">Due</span> : d.schedule === "adhoc" ? <span className="pill nodata">On demand</span> : <span className="pill ok">Done</span>}</td>
                  <td className="num">{d.schedule === "daily" ? `${st} d` : "—"}</td>
                  <td>{last ? fmtDate(last) : "—"}</td>
                  <td className="num">{n}</td>
                  <td className="num">
                    <div className="row" style={{ justifyContent: "flex-end" }}>
                      {d.active && <Link className="btn sm primary" href={`/wellness/${d.slug}`}>Answer</Link>}
                      {admin && <Link className="btn sm" href={`/questionnaires/${d.slug}`}>Edit</Link>}
                      <form action={setQuestionnaireActive}>
                        <input type="hidden" name="slug" value={d.slug} /><input type="hidden" name="active" value={String(!d.active)} />
                        <button className="btn sm" type="submit">{d.active ? "Deactivate" : "Activate"}</button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Wellness composite" hint={`0–100, 100 = best on every item · band = ${win}-day mean ± 1 SD`}>
        {wellness.length === 0 ? <Empty title="No wellness responses yet">Answer the morning wellness form to start a baseline; readiness uses it after {ctx.settings.baselines.minN} days.</Empty> : (
          <TimeChart ariaLabel="Wellness composite trend" yMin={0} yMax={100}
            series={[{ id: "c", label: "Composite", color: "var(--s1)", kind: "line", points: wellness.map((w) => [dx(w.date), Number(w.composite)]) }]}
            band={{ label: "Baseline ±1 SD", points: band }} />
        )}
      </Card>

      {wellnessDef && wellness.length > 0 && (
        <div className="grid cols-3">
          {itemKeys.map((it) => (
            <Card key={it.key} title={it.label} hint={`latest ${fmt((wellness.at(-1)?.item_scores[it.key] ?? NaN) * 100)}/100`}>
              <TimeChart ariaLabel={`${it.label} trend`} height={140} yMin={0} yMax={100}
                series={[{ id: it.key, label: it.label, color: "var(--s1)", kind: "line", points: wellness.map((w) => [dx(w.date), w.item_scores[it.key] != null ? w.item_scores[it.key] * 100 : null]) }]} />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
