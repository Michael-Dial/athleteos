import { apiRoute, body, json } from "@/lib/api/http";
import { issueToken, listTokens } from "@/lib/api/tokens";
import { TokenCreate } from "@/lib/api/schemas";

const iso = (v: string | null) => (v ? new Date(v).toISOString() : null);

export const GET = apiRoute(async ({ ctx }) => ({
  tokens: (await listTokens(ctx.athlete.id)).map((t) => ({ id: t.id, name: t.name, prefix: t.prefix, createdAt: iso(t.created_at), lastUsedAt: iso(t.last_used_at) })),
}));

export const POST = apiRoute(async ({ req, ctx }) => {
  const b = await body(req, TokenCreate);
  const { token, row } = await issueToken(ctx.athlete.id, b.name);
  return json({ token, id: row.id, name: row.name, createdAt: iso(row.created_at) }, 201);
});
