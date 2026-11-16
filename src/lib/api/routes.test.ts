import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { ROUTES, openApiDocument } from "./openapi";

const ROOT = join(__dirname, "../../app/api/v1");
const PUBLIC_FILES = new Set(["auth/token/route.ts", "auth/token/verify/route.ts", "openapi.json/route.ts"]);

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? routeFiles(p) : f === "route.ts" ? [p] : [];
  });
}

const files = routeFiles(ROOT).map((p) => {
  const rel = relative(ROOT, p).split(sep).join("/");
  const apiPath = "/" + rel.replace(/\/?route\.ts$/, "").replace(/\[(\w+)\]/g, "{$1}");
  const src = readFileSync(p, "utf8");
  const methods = [...src.matchAll(/export (?:const|async function|function) (GET|POST|PUT|PATCH|DELETE)\b/g)].map((m) => m[1]);
  return { rel, apiPath, src, methods };
});

describe("/api/v1 route table", () => {
  it("finds the route files", () => {
    expect(files.length).toBeGreaterThan(15);
  });

  it("every non-public handler is wrapped in apiRoute (so it authenticates)", () => {
    for (const f of files) {
      if (PUBLIC_FILES.has(f.rel)) continue;
      for (const m of f.methods) {
        expect(f.src, `${f.rel} ${m}`).toMatch(new RegExp(`export const ${m}\\s*=\\s*apiRoute`));
      }
    }
  });

  it("every handler is documented in the OpenAPI route table, and vice versa", () => {
    const implemented = new Set(files.filter((f) => f.rel !== "openapi.json/route.ts").flatMap((f) => f.methods.map((m) => `${m.toLowerCase()} ${f.apiPath}`)));
    const documented = new Set(ROUTES.map((r) => `${r.method} ${r.path}`));
    expect([...implemented].filter((x) => !documented.has(x)), "implemented but undocumented").toEqual([]);
    expect([...documented].filter((x) => !implemented.has(x)), "documented but not implemented").toEqual([]);
  });

  it("builds an OpenAPI document with request and response schemas", () => {
    const doc = openApiDocument("http://x/api/v1");
    const today = doc.paths["/today"].get as { responses: Record<string, { content?: unknown }> };
    expect(today.responses["200"].content).toBeDefined();
    const post = doc.paths["/training/manual"].post as { requestBody: unknown };
    expect(post.requestBody).toBeDefined();
    expect(JSON.stringify(doc)).not.toContain('"type":"undefined"');
  });
});
