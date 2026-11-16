import "server-only";
import type { AppCtx } from "../domain/context";
import { listPhases, listPlanSessions, matchPlan, plannedLoad } from "../domain/plan";
import { getTraining } from "../domain/training";
import { todayIn } from "../dates";
import { phaseDto, planSessionDto } from "./dto";

/** Phases and planned sessions in a window, each session with its plan-vs-actual status. */
export async function planWindow(ctx: AppCtx, start: string, end: string) {
  const today = todayIn(ctx.settings.timezone);
  const [phases, plan, training] = await Promise.all([
    listPhases(ctx.athlete.id, start, end),
    listPlanSessions(ctx.athlete.id, start, end),
    getTraining(ctx, start, end < today ? end : today),
  ]);
  const { matches, unplanned } = matchPlan(plan, training.sessions);
  return {
    phases: phases.map(phaseDto),
    sessions: matches.map((m) =>
      planSessionDto(m.plan, m.actual ? "done" : m.plan.skipped ? "skipped" : m.plan.date < today ? "missed" : "planned", m.actual?.key ?? null, m.how, plannedLoad(m.plan)),
    ),
    unplannedKeys: unplanned.filter((u) => !u.excluded).map((u) => u.key),
    owError: training.owError,
  };
}
