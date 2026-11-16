import { apiRoute } from "@/lib/api/http";
import { isDue, listDefs, listResponses, streak } from "@/lib/domain/questionnaires";
import { questionnaireDto } from "@/lib/api/dto";
import { addDays, startOfWeek, todayIn } from "@/lib/dates";

export const GET = apiRoute(async ({ ctx }) => {
  const today = todayIn(ctx.settings.timezone);
  const defs = await listDefs(ctx.athlete.id, true);
  return {
    questionnaires: await Promise.all(defs.map(async (d) => {
      const last = (await listResponses(ctx.athlete.id, d.id, addDays(today, -400), today)).at(-1);
      return {
        ...questionnaireDto(d),
        due: d.active && (await isDue(d, today, startOfWeek(today))),
        streakDays: d.schedule === "daily" ? await streak(d.id, today) : null,
        lastAnswered: last?.date ?? null,
      };
    })),
  };
});
