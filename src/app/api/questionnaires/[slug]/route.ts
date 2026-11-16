import { NextResponse } from "next/server";
import { getCtx } from "@/lib/domain/context";
import { getDef } from "@/lib/domain/questionnaires";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getCtx();
  const def = await getDef(ctx.athlete.id, slug);
  if (!def) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = { slug: def.slug, name: def.name, description: def.description, kind: def.kind, schedule: def.schedule, items: def.items };
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: { "content-type": "application/json", "content-disposition": `attachment; filename="${def.slug}.json"` },
  });
}
