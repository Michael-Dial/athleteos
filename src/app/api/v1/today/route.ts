import { apiRoute, query } from "@/lib/api/http";
import { DateQuery } from "@/lib/api/schemas";
import { getReadiness } from "@/lib/domain/readiness";
import { rankNight, METRIC_VALUE } from "@/lib/domain/nightly";
import { isDue, listDefs } from "@/lib/domain/questionnaires";
import { readinessDto } from "@/lib/api/dto";
import { planWindow } from "@/lib/api/plan";
import { startOfWeek, todayIn } from "@/lib/dates";

const NIGHT_METRICS = ["sleep", "hrv", "rhr", "respiratory_rate", "spo2"] as const;

// Everything the home screen needs in one round trip.
export const GET = apiRoute(async ({ req, ctx }) => {
  const qy = query(req, DateQuery);
  const date = qy.date ?? todayIn(ctx.settings.timezone);
  const [r, plan, defs] = await Promise.all([getReadiness(ctx, date), planWindow(ctx, date, date), listDefs(ctx.athlete.id)]);
  const due = [];
  for (const d of defs) if (await isDue(d, date, startOfWeek(date))) due.push({ slug: d.slug, name: d.name, schedule: d.schedule, kind: d.kind });
  const lastNight = Object.fromEntries(
    NIGHT_METRICS.map((m) => {
      const rk = rankNight(ctx, r.nightly, date, m);
      const v = (row: (typeof r.nightly)[number]) => ({ device: { key: row.key, name: row.name }, value: METRIC_VALUE[m](row)! });
      return [m, { primary: rk.primary ? { ...v(rk.primary), fallback: rk.fallback } : null, others: rk.others.map(v) }];
    }),
  );
  return {
    date,
    readiness: readinessDto(r, false),
    plan: plan.sessions,
    checkIn: { due, wellnessComposite: r.wellness.today ? Number(r.wellness.today.composite) : null },
    lastNight,
  };
});
