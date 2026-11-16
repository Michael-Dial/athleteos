import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCtx } from "@/lib/domain/context";
import { getDef, getResponse, listResponses } from "@/lib/domain/questionnaires";
import { addDays, fmtDate, isISODate, todayIn } from "@/lib/dates";
import { Card, Empty } from "@/components/ui";
import { TimeChart } from "@/components/charts";
import { QuestionnaireForm } from "@/components/questionnaire-form";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return { title: (await params).slug.replace(/-/g, " ") };
}

export default async function AnswerPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ date?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getCtx();
  const def = await getDef(ctx.athlete.id, slug);
  if (!def) notFound();
  const today = todayIn(ctx.settings.timezone);
  const date = isISODate(sp.date) && sp.date <= today ? sp.date : today;
  const [existing, history] = await Promise.all([getResponse(def.id, date), listResponses(ctx.athlete.id, def.id, addDays(today, -89), today)]);
  const initial: Record<string, string> = {};
  if (existing) for (const [k, v] of Object.entries(existing.answers)) if (v != null) initial[k] = String(v);
  const dx = (d: string) => Date.parse(`${d}T12:00:00Z`);
  const numeric = def.items.filter((i) => i.type === "scale" || i.type === "number" || i.type === "boolean");
  const textual = def.items.filter((i) => i.type === "text" || i.type === "choice");

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div><h1>{def.name}</h1><p className="sub">{def.description}</p></div>
        <div className="row">
          <Link className="btn" href={`/wellness/${slug}?date=${addDays(date, -1)}`}>Previous day</Link>
          <Link className="btn" href={`/questionnaires/${slug}`}>Edit form</Link>
        </div>
      </div>
      <div className="grid cols-2">
        <Card title={existing ? `Your answers for ${fmtDate(date)}` : `Answer for ${fmtDate(date)}`} hint={existing ? "saving again replaces them" : undefined}>
          <QuestionnaireForm key={date} slug={slug} date={date} items={def.items} initial={initial} />
        </Card>
        <div className="stack-lg">
          {history.length === 0 ? <Card><Empty title="No responses yet">Trends for each question appear here once you&apos;ve answered a few times.</Empty></Card> : (
            <>
              {numeric.map((it) => (
                <Card key={it.key} title={it.label} hint={it.type === "boolean" ? "1 = yes" : it.unit}>
                  <TimeChart ariaLabel={`${it.label} over time`} height={130} digits={it.type === "number" ? 1 : 0}
                    yMin={it.type === "boolean" ? 0 : it.min} yMax={it.type === "boolean" ? 1 : it.max}
                    series={[{ id: it.key, label: it.label, color: "var(--s1)", kind: it.type === "boolean" ? "dots" : "line",
                      points: history.map((r) => { const v = r.answers[it.key]; return [dx(r.date), typeof v === "number" ? v : typeof v === "boolean" ? (v ? 1 : 0) : null]; }) }]} />
                </Card>
              ))}
              {textual.length > 0 && (
                <Card title="Recent notes and choices" className="flush">
                  <div className="table-wrap">
                    <table className="t">
                      <thead><tr><th>Date</th>{textual.map((t) => <th key={t.key}>{t.label}</th>)}</tr></thead>
                      <tbody>
                        {[...history].reverse().slice(0, 14).map((r) => (
                          <tr key={r.id}><td style={{ whiteSpace: "nowrap" }}><Link href={`/wellness/${slug}?date=${r.date}`}>{fmtDate(r.date)}</Link></td>{textual.map((t) => <td key={t.key} className="small">{String(r.answers[t.key] ?? "")}</td>)}</tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
