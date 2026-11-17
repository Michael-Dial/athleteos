// Swift models and client methods for the iOS app, generated from the same
// OpenAPI document the server publishes. The app decodes exactly what the
// route table says the server sends; swift-gen.test.ts fails when the
// committed Swift no longer matches, so a contract change can't ship to the
// API without the app's models moving with it.
//
// Regenerate: UPDATE_SWIFT=1 npx vitest run lib/api/swift-gen

type Schema = {
  type?: string;
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  enum?: unknown[];
  anyOf?: Schema[];
  nullable?: boolean;
  additionalProperties?: Schema | boolean;
  description?: string;
};

interface Op {
  parameters?: { in: string }[];
  method: string;
  path: string;
  summary?: string;
  requestBody?: { content: { "application/json": { schema: Schema } } };
  responses: Record<string, { content?: { "application/json": { schema: Schema } } }>;
}

// Hand-written in AthleteKit because their shape is a union of objects.
const SKIP = new Set(["post /auth/token"]);

const KEYWORDS = new Set([
  "associatedtype", "class", "deinit", "enum", "extension", "fileprivate", "func", "import", "init", "inout", "internal", "let", "open",
  "operator", "private", "protocol", "public", "rethrows", "static", "struct", "subscript", "typealias", "var", "break", "case", "continue",
  "default", "defer", "do", "else", "fallthrough", "for", "guard", "if", "in", "repeat", "return", "switch", "where", "while", "as", "Any",
  "catch", "false", "is", "nil", "super", "self", "Self", "throw", "throws", "true", "try", "Type", "Protocol",
]);

const words = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(/[^A-Za-z0-9]+/).filter(Boolean);
export const pascal = (s: string) => words(s).map((w) => w[0].toUpperCase() + w.slice(1)).join("") || "Value";
const camel = (s: string) => { const p = pascal(s); return p[0].toLowerCase() + p.slice(1); };

function singular(s: string): string {
  if (/series$/i.test(s)) return s;
  if (/ies$/.test(s)) return s.slice(0, -3) + "y";
  if (/[^s]s$/.test(s) && s.length > 3) return s.slice(0, -1);
  return s;
}

function ident(s: string): string {
  const c = /^[A-Za-z_][A-Za-z0-9_]*$/.test(s) ? s : camel(s);
  const v = /^[0-9]/.test(c) ? `v${c}` : c;
  return KEYWORDS.has(v) ? `\`${v}\`` : v;
}

function caseName(raw: string): string {
  const c = camel(raw);
  const v = /^[0-9]/.test(c) ? `v${c}` : c || "empty";
  return KEYWORDS.has(v) ? `\`${v}\`` : v;
}

const PRIM: Record<string, string> = { string: "String", number: "Double", integer: "Int", boolean: "Bool" };

// Type names generated code itself refers to, or that Swift forbids for a nested type.
const RESERVED_TYPES = new Set(["Type", "Protocol", "Self", "Any", "String", "Int", "Double", "Bool", "Decoder", "Encoder", "CodingKeys",
  "JSONValue", "JSONScalar", "URLQueryItem", "APIClient", "Data", "Date", "Error", "Result", "URL", "Optional", "Array", "Dictionary"]);

class Scope {
  decls: string[] = [];
  used = new Set<string>();
  claim(base: string): string {
    const name = RESERVED_TYPES.has(base) ? `${base}Value` : base;
    let n = name, i = 2;
    while (this.used.has(n)) n = `${name}${i++}`;
    this.used.add(n);
    return n;
  }
}

function indent(s: string, by = "    "): string {
  return s.split("\n").map((l) => (l ? by + l : l)).join("\n");
}

function swiftType(s: Schema, hint: string, scope: Scope): string {
  if (s.anyOf) {
    const types = new Set(s.anyOf.map((x) => x.type));
    if (types.size === 1 && PRIM[[...types][0] ?? ""]) return PRIM[[...types][0]!];
    if ([...types].every((t) => t && PRIM[t])) return "JSONScalar";
    return "JSONValue";
  }
  if (s.enum && s.type === "string") return enumDecl(s.enum.map(String), hint, scope);
  if (s.type && PRIM[s.type]) return PRIM[s.type];
  if (s.type === "array") {
    const it = s.items ?? {};
    const inner = swiftType(it, singular(hint), scope);
    return `[${inner}${it.nullable ? "?" : ""}]`;
  }
  if (s.type === "object" || s.properties || s.additionalProperties !== undefined) {
    if (!s.properties || Object.keys(s.properties).length === 0) {
      const ap = s.additionalProperties;
      if (ap && typeof ap === "object" && Object.keys(ap).length) {
        const inner = swiftType(ap, singular(hint), scope);
        return `[String: ${inner}${ap.nullable ? "?" : ""}]`;
      }
      return "[String: JSONValue]";
    }
    return structDecl(s, hint, scope);
  }
  return "JSONValue";
}

function enumDecl(values: string[], hint: string, scope: Scope): string {
  const name = scope.claim(pascal(hint));
  const cases = values.map((v) => `    case ${caseName(v)} = ${JSON.stringify(v)}`);
  // Installed apps lag the server: a value added later decodes to .unrecognized instead of failing the whole screen.
  scope.decls.push([
    `public enum ${name}: String, Codable, Hashable, Sendable, CaseIterable {`,
    ...cases,
    `    case unrecognized = "\\u{0}unrecognized"`,
    `    public init(from decoder: Decoder) throws {`,
    `        let raw = try decoder.singleValueContainer().decode(String.self)`,
    `        self = ${name}(rawValue: raw) ?? .unrecognized`,
    `    }`,
    `}`,
  ].join("\n"));
  return name;
}

function structDecl(s: Schema, hint: string, scope: Scope, fixedName?: string): string {
  const name = fixedName ?? scope.claim(pascal(hint));
  const inner = new Scope();
  const req = new Set(s.required ?? []);
  const props = Object.entries(s.properties ?? {}).map(([key, ps]) => {
    const t = swiftType(ps, key, inner);
    const optional = !req.has(key) || !!ps.nullable;
    return { key, id: ident(key), type: optional ? `${t}?` : t, optional, doc: ps.description };
  });
  const needsKeys = props.some((p) => p.id.replace(/`/g, "") !== p.key);
  const lines: string[] = [`public struct ${name}: Codable, Hashable, Sendable {`];
  for (const p of props) {
    if (p.doc) lines.push(`    /// ${p.doc.replace(/\s+/g, " ")}`);
    lines.push(`    public var ${p.id}: ${p.type}`);
  }
  if (props.length) {
    lines.push("");
    lines.push(`    public init(${props.map((p) => `${p.id}: ${p.type}${p.optional ? " = nil" : ""}`).join(", ")}) {`);
    for (const p of props) lines.push(`        self.${p.id.replace(/`/g, "")} = ${p.id}`);
    lines.push("    }");
  } else {
    lines.push("    public init() {}");
  }
  if (needsKeys) {
    lines.push("");
    lines.push("    enum CodingKeys: String, CodingKey {");
    for (const p of props) lines.push(`        case ${p.id} = ${JSON.stringify(p.key)}`);
    lines.push("    }");
  }
  for (const d of inner.decls) { lines.push(""); lines.push(indent(d)); }
  lines.push("}");
  scope.decls.push(lines.join("\n"));
  return name;
}

function routeBase(path: string): string {
  return path.split("/").filter(Boolean).map((seg) => {
    const m = seg.match(/^\{(\w+)\}$/);
    return m ? `By${pascal(m[1])}` : pascal(seg);
  }).join("");
}

const cap = (m: string) => m[0].toUpperCase() + m.slice(1);

/**
 * A JSON value matching a schema: every property present and arrays of one
 * (max), or only what is required and non-null (min). The app's tests decode
 * both into the generated types, so a model that can't read a shape the
 * route table allows fails on a Mac before it fails on a phone.
 */
export function sample(s: Schema, mode: "max" | "min"): unknown {
  if (s.anyOf) return sample(s.anyOf[0], mode);
  if (s.enum) return s.enum[0];
  switch (s.type) {
    case "string": return "2026-11-17";
    case "number": return 1.5;
    case "integer": return 2;
    case "boolean": return true;
    case "array": return mode === "max" && s.items ? [sample(s.items, mode)] : [];
  }
  if (s.properties) {
    const req = new Set(s.required ?? []);
    const out: Record<string, unknown> = {};
    for (const [k, ps] of Object.entries(s.properties)) {
      if (mode === "max") out[k] = sample(ps, mode);
      else if (req.has(k) && !ps.nullable) out[k] = sample(ps, mode);
      else if (req.has(k)) out[k] = null;
    }
    return out;
  }
  if (s.additionalProperties && typeof s.additionalProperties === "object" && Object.keys(s.additionalProperties).length) {
    return mode === "max" ? { key: sample(s.additionalProperties, mode) } : {};
  }
  return {};
}

/** Every response type with its two samples, and the Swift test that decodes them. */
export function generateSamples(doc: { paths: Record<string, Record<string, Op>> }): { json: string; swiftTest: string } {
  const top = new Scope();
  const samples: Record<string, { max: unknown; min: unknown }> = {};
  for (const [path, ops] of Object.entries(doc.paths)) {
    for (const [method, op] of Object.entries(ops)) {
      if (SKIP.has(`${method} ${path}`)) continue;
      const okStatus = Object.keys(op.responses).find((k) => k !== "default")!;
      const res = op.responses[okStatus]?.content?.["application/json"]?.schema;
      if (!res) continue;
      // Same naming walk as generateSwift, so the names match the generated types.
      const name = swiftType(res, `${routeBase(path)}${method === "get" ? "" : cap(method)}Response`, top);
      if (!/^[A-Z]\w*$/.test(name)) continue;
      samples[name] = { max: sample(res, "max"), min: sample(res, "min") };
    }
  }
  const names = Object.keys(samples);
  const swiftTest = [
    "// Generated by src/lib/api/swift-gen.ts. Do not edit.",
    "import Foundation",
    "import Testing",
    "@testable import AthleteKit",
    "",
    "@Suite struct GeneratedDecodeTests {",
    ...names.flatMap((n) => [
      `    @Test func decodes${n}() throws {`,
      `        try Samples.decode(${n}.self, "${n}")`,
      "    }",
    ]),
    "}",
    "",
  ].join("\n");
  return { json: JSON.stringify(samples, null, 1) + "\n", swiftTest };
}

export function generateSwift(doc: { paths: Record<string, Record<string, Op>> }): string {
  const top = new Scope();
  const methods: string[] = [];
  for (const [path, ops] of Object.entries(doc.paths)) {
    for (const [method, op] of Object.entries(ops)) {
      if (SKIP.has(`${method} ${path}`)) continue;
      const base = routeBase(path);
      const okStatus = Object.keys(op.responses).find((k) => k !== "default")!;
      const resSchema = op.responses[okStatus]?.content?.["application/json"]?.schema;
      const bodySchema = op.requestBody?.content["application/json"].schema;
      const suffix = method === "get" ? "" : cap(method);
      const resType = resSchema ? swiftType(resSchema, `${base}${suffix}Response`, top) : null;
      const bodyType = bodySchema ? swiftType(bodySchema, `${base}${suffix}Body`, top) : null;
      const params = [...path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
      const hasQuery = (op.parameters ?? []).some((p) => p.in === "query");
      const args = [
        ...params.map((p) => `${ident(p)}: String`),
        ...(bodyType ? [`body: ${bodyType}`] : []),
        ...(hasQuery ? ["query: [URLQueryItem] = []"] : []),
      ];
      const swiftPath = path.replace(/\{(\w+)\}/g, (_, p) => `\\(APIClient.segment(${ident(p)}))`);
      const call = [`"${method.toUpperCase()}"`, `"${swiftPath}"`, ...(hasQuery ? ["query: query"] : []), ...(bodyType ? ["body: body"] : [])].join(", ");
      const fn = `${method}${base}`;
      methods.push([
        ...(op.summary ? [`    /// ${op.summary.replace(/\s+/g, " ")}`] : []),
        `    func ${fn}(${args.join(", ")}) async throws${resType ? ` -> ${resType}` : ""} {`,
        `        ${resType ? "try await send" : "try await sendIgnoringBody"}(${call})`,
        `    }`,
      ].join("\n"));
    }
  }
  return [
    "// Generated by src/lib/api/swift-gen.ts from the server's route table. Do not edit.",
    "// Regenerate with: cd src && UPDATE_SWIFT=1 npx vitest run lib/api/swift-gen",
    "",
    "import Foundation",
    "",
    ...top.decls.flatMap((d) => [d, ""]),
    "public extension APIClient {",
    methods.join("\n\n"),
    "}",
    "",
  ].join("\n");
}
