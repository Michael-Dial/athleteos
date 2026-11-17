import type { NextRequest } from "next/server";
import { owConfig } from "@/lib/ow/client";
import { forwardRequestHeaders, forwardResponseHeaders, sdkPathAllowed } from "@/lib/ow/sdk-proxy";

// The phone sync SDK's route to OW (lib/ow/sdk-proxy.ts says what passes).
// Outside /api/v1 because the SDK authenticates with its own OW token, not an
// AthleteOS token; proxy.ts leaves this path to OW's own check.

export const dynamic = "force-dynamic";
// Sync batches can be a few megabytes over a phone connection.
export const maxDuration = 120;

async function handle(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const path = (await params).path.join("/");
  if (!sdkPathAllowed(req.method, path)) return Response.json({ detail: "Not found" }, { status: 404 });
  const cfg = await owConfig();
  if (!cfg) return Response.json({ detail: "Sync is not available on this server" }, { status: 503 });
  const hasBody = req.method !== "GET" && req.method !== "DELETE";
  let upstream: Response;
  try {
    upstream = await fetch(`${cfg.base}/${path}${req.nextUrl.search}`, {
      method: req.method,
      headers: forwardRequestHeaders(req.headers),
      body: hasBody ? await req.arrayBuffer() : undefined,
      redirect: "manual",
      signal: AbortSignal.timeout(110_000),
    });
  } catch {
    // The SDK keeps the batch in its outbox and retries on 5xx.
    return Response.json({ detail: "Sync backend unreachable" }, { status: 502, headers: { "retry-after": "60" } });
  }
  return new Response(upstream.body, { status: upstream.status, headers: forwardResponseHeaders(upstream.headers) });
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
