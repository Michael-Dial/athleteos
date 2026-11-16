import { NextResponse, type NextRequest } from "next/server";
import { openApiDocument } from "@/lib/api/openapi";

// Public: describes the API's shape only, no data. Used for client codegen.
export function GET(req: NextRequest) {
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3020";
  return NextResponse.json(openApiDocument(`${proto}://${host}/api/v1`));
}
