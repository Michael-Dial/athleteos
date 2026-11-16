import { NextResponse } from "next/server";

// Liveness only: must answer even when Postgres or Open Wearables is down, so
// the container isn't restarted for a dependency's outage.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ status: "ok" });
}
