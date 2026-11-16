import { apiRoute, query, window, WindowQuery } from "@/lib/api/http";
import { getTraining } from "@/lib/domain/training";
import { trainingDto } from "@/lib/api/dto";

export const GET = apiRoute(async ({ req, ctx }) => {
  const w = window(ctx, query(req, WindowQuery), 28, 366);
  const t = await getTraining(ctx, w.start, w.end);
  return { ...w, sessions: t.sessions.map(trainingDto), owError: t.owError };
});
