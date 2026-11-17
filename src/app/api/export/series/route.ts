import type { NextRequest } from "next/server";
import { getCtx } from "@/lib/domain/context";
import { exportSeries } from "@/lib/ow/api";
import { isISODate } from "@/lib/dates";
import { isSeriesType } from "@/lib/series-types";
import { errorMessage } from "@/lib/domain/errors";

// Streams OW's bulk export straight through; nothing is buffered or stored.
export async function GET(req: NextRequest) {
  const ctx = await getCtx();
  if (!ctx.ow) return new Response("No device data account is linked", { status: 409 });
  const sp = req.nextUrl.searchParams;
  const start = sp.get("start");
  const end = sp.get("end");
  const format = sp.get("format") === "csv" ? "csv" : "ndjson";
  const types = (sp.get("types") ?? "").split(",").filter(isSeriesType);
  if (!isISODate(start) || !isISODate(end) || end <= start) return new Response("start/end must be dates with end > start (end exclusive)", { status: 400 });
  try {
    const upstream = await exportSeries(ctx.ow, { start, end, types, format });
    return new Response(upstream.body, {
      headers: {
        "content-type": format === "csv" ? "text/csv; charset=utf-8" : "application/x-ndjson",
        "content-disposition": `attachment; filename="series_${types.join("-") || "all"}_${start}_${end}.${format === "csv" ? "csv" : "ndjson"}"`,
      },
    });
  } catch (e) {
    return new Response(errorMessage(e), { status: 502 });
  }
}
