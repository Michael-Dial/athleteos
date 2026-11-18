import { z } from "zod";
import { CopyWeekInput, ManualSessionInput, PhaseInput, PlanSessionInput } from "../domain/inputs";
import { DefSchema } from "../domain/questionnaire-schema";
import { SettingsSchema } from "../settings";
import {
  LastNightDto, NightDto, PhaseDto, PlanSessionDto, QuestionnaireDto, ReadinessDto, ResponseDto, TrainingDto, WellnessDto,
} from "./dto";
import { CoverageDto, IllnessDto, IntensityDto, ReviewDto, TrendsDto, ZonesDto } from "./dto-dashboards";
import {
  AnnotationPatch, ConnectBody, DeleteAccountRequest, InviteRedeem, RegisterRequest, TokenVerifyRequest, ZonesQuery, CoverageQuery, IllnessQuery, ReviewQuery, TrendsQuery, AnswersBody, DateQuery, EndpointQuery, PushSubscriptionBody, ReadinessQuery, SettingsPatch, TokenCreate, TokenRequest, WindowQuery,
} from "./schemas";

// The route table is written once here and drives the OpenAPI document; a
// test checks that every route file under app/api/v1 appears in it.

type Method = "get" | "post" | "put" | "patch" | "delete";
export interface RouteSpec {
  method: Method;
  path: string;
  summary: string;
  tag: string;
  public?: boolean;
  query?: z.ZodObject;
  body?: z.ZodType;
  response?: z.ZodType;
  status?: number;
}

const Window = (key: string, item: z.ZodType) => z.object({ start: z.string(), end: z.string(), [key]: z.array(item), owError: z.string().nullable().optional() });
const Token = z.object({ token: z.string().describe("Shown once; store it securely"), id: z.number(), name: z.string(), createdAt: z.string() });
const Created = z.object({ id: z.number() });
const Challenge = z.object({ challengeId: z.string(), delivery: z.literal("email"), destination: z.string().describe("Masked address the code went to"), expiresInSec: z.number() });

export const ROUTES: RouteSpec[] = [
  { method: "post", path: "/auth/token", tag: "auth", public: true,
    summary: "Native app sign-in. Returns 201 with a token, or 202 with a challengeId when emailed codes are on (then call /auth/token/verify)",
    body: TokenRequest, response: z.union([Token, Challenge]), status: 201 },
  { method: "post", path: "/auth/token/verify", tag: "auth", public: true, summary: "Second step: exchange the emailed 6-digit code for a token", body: TokenVerifyRequest, response: Token, status: 201 },
  { method: "post", path: "/auth/invite", tag: "auth", public: true, summary: "Accept an invite (or reset) code in the app: sets the password and returns a token for this device", body: InviteRedeem,
    response: Token.extend({ athlete: z.object({ id: z.number(), name: z.string() }) }), status: 201 },
  { method: "get", path: "/auth/registration", tag: "auth", public: true, summary: "Whether new accounts can sign up here, and if not, why (invite only, or email not set up)",
    response: z.object({ mode: z.enum(["open", "invite"]), available: z.boolean(), reason: z.string().nullable() }) },
  { method: "post", path: "/auth/register", tag: "auth", public: true, summary: "Sign up: emails a 6-digit code to confirm the address (then call /auth/register/verify). The same answer whether or not the address already has an account",
    body: RegisterRequest, response: Challenge.omit({ delivery: true }), status: 202 },
  { method: "post", path: "/auth/register/verify", tag: "auth", public: true, summary: "Sign up, step two: the emailed code creates the member account and returns a token for this device", body: TokenVerifyRequest,
    response: Token.extend({ athlete: z.object({ id: z.number(), name: z.string() }) }), status: 201 },
  { method: "get", path: "/auth/tokens", tag: "auth", summary: "List active tokens", response: z.object({ tokens: z.array(z.object({ id: z.number(), name: z.string(), prefix: z.string(), createdAt: z.string().nullable(), lastUsedAt: z.string().nullable() })) }) },
  { method: "post", path: "/auth/tokens", tag: "auth", summary: "Create a token for the signed-in athlete", body: TokenCreate, response: Token, status: 201 },
  { method: "delete", path: "/auth/tokens/{id}", tag: "auth", summary: "Revoke a token", status: 204 },
  { method: "get", path: "/accounts", tag: "accounts", summary: "Services the athlete can connect and the device accounts they hold, by brand",
    response: z.object({
      services: z.array(z.object({ provider: z.string(), name: z.string(), kind: z.enum(["cloud", "phone"]).describe("cloud: connect via OAuth; phone: synced by the app from the phone's health store"), status: z.enum(["connected", "lapsed", "none"]), count: z.number(), lastSyncedAt: z.string().nullable() })),
      accounts: z.array(z.object({ id: z.string(), provider: z.string(), name: z.string(), label: z.string(), device: z.string().nullable(), status: z.enum(["connected", "expired", "disconnected"]), lastSyncedAt: z.string().nullable(), canSync: z.boolean() })),
      errors: z.array(z.string()),
    }) },
  { method: "post", path: "/accounts/{provider}/connect", tag: "accounts", summary: "Start a cloud provider's OAuth; open authorizationUrl in a browser session", body: ConnectBody, response: z.object({ authorizationUrl: z.string() }) },
  { method: "post", path: "/accounts/{provider}/sync", tag: "accounts", summary: "Ask a connected cloud provider for new data now", response: z.object({ requested: z.boolean() }) },
  { method: "post", path: "/wearables/sdk-token", tag: "accounts", summary: "Phone health-store sync session for the athlete's own data: a token pair for the sync SDK, which talks to {server}{syncPath}",
    response: z.object({ owUserId: z.string(), accessToken: z.string(), refreshToken: z.string(), expiresIn: z.number().nullable(), syncPath: z.string() }) },
  { method: "get", path: "/me", tag: "athlete", summary: "Signed-in user, their athlete, timezone, today's date and device-data status", response: z.object({ user: z.object({ id: z.number(), email: z.string(), role: z.enum(["admin", "member"]), onboarded: z.boolean().describe("First-run setup finished or skipped, on the web or in an app") }), athlete: z.object({ id: z.number(), name: z.string() }), timezone: z.string(), today: z.string(), openWearables: z.object({ configured: z.boolean(), linked: z.boolean() }), auth: z.enum(["token", "session"]) }) },
  { method: "post", path: "/me/onboarded", tag: "athlete", summary: "Mark first-run setup finished (or skipped) for the signed-in user", status: 204 },
  { method: "post", path: "/me/delete", tag: "athlete", summary: "Delete the signed-in user's own account, their athlete's data and their device-data account. Asks for the password again", body: DeleteAccountRequest, status: 204 },
  { method: "get", path: "/today", tag: "athlete", summary: "Home screen: readiness, today's plan, due forms, last night per metric (all devices)", query: DateQuery,
    response: z.object({ date: z.string(), readiness: ReadinessDto, plan: z.array(PlanSessionDto), checkIn: z.object({ due: z.array(z.object({ slug: z.string(), name: z.string(), schedule: z.string(), kind: z.string() })), wellnessComposite: z.number().nullable() }), lastNight: z.record(z.enum(["sleep", "hrv", "rhr", "respiratory_rate", "spo2"]), LastNightDto) }) },
  { method: "get", path: "/readiness", tag: "athlete", summary: "Readiness with every pillar, baselines and trend series", query: ReadinessQuery, response: ReadinessDto },
  { method: "get", path: "/review", tag: "dashboards", summary: "Weekly review: plan vs delivered, load, HRV/RHR/sleep vs previous weeks, wellness, check-ins, observations", query: ReviewQuery, response: ReviewDto },
  { method: "get", path: "/coverage", tag: "dashboards", summary: "Data coverage and sync health: device x night grid, baseline-device gaps, sync staleness, questionnaire adherence", query: CoverageQuery, response: CoverageDto },
  { method: "get", path: "/intensity", tag: "dashboards", summary: "Time in three HR zones per week and session, with Polarization-Index (max 182 days)", query: WindowQuery, response: IntensityDto },
  { method: "get", path: "/zones", tag: "dashboards", summary: "Time in zone for heart rate, running pace, running power or cycling power, as a share of recorded time (max 371 days)", query: ZonesQuery, response: ZonesDto },
  { method: "get", path: "/trends", tag: "dashboards", summary: "Weekly long-term trends per device (load, HRV, RHR, sleep, body mass, VO2max)", query: TrendsQuery, response: TrendsDto },
  { method: "get", path: "/illness", tag: "dashboards", summary: "Illness watch: nightly multi-signal deviations vs a lagged personal baseline (not a diagnosis)", query: IllnessQuery, response: IllnessDto },
  { method: "get", path: "/nightly", tag: "wearables", summary: "One row per night per device (max 366 days)", query: WindowQuery, response: Window("nights", NightDto) },
  { method: "get", path: "/training", tag: "training", summary: "Training sessions: device workouts grouped across devices, plus manual logs (max 366 days)", query: WindowQuery, response: Window("sessions", TrainingDto) },
  { method: "patch", path: "/training/workouts/{owWorkoutId}", tag: "training", summary: "Annotate a device workout (RPE, notes, plan link, exclusion). Omitted fields are kept.", body: AnnotationPatch, status: 204 },
  { method: "post", path: "/training/manual", tag: "training", summary: "Log a session no device recorded", body: ManualSessionInput, response: z.object({ id: z.number(), key: z.string() }), status: 201 },
  { method: "put", path: "/training/manual/{id}", tag: "training", summary: "Replace a manual session", body: ManualSessionInput, status: 204 },
  { method: "delete", path: "/training/manual/{id}", tag: "training", summary: "Delete a manual session", status: 204 },
  { method: "get", path: "/plan", tag: "plan", summary: "Phases and planned sessions with plan-vs-actual status (max 400 days)", query: WindowQuery,
    response: z.object({ start: z.string(), end: z.string(), phases: z.array(PhaseDto), sessions: z.array(PlanSessionDto), unplannedKeys: z.array(z.string()), owError: z.string().nullable() }) },
  { method: "post", path: "/plan/sessions", tag: "plan", summary: "Add a planned session", body: PlanSessionInput, response: Created, status: 201 },
  { method: "put", path: "/plan/sessions/{id}", tag: "plan", summary: "Replace a planned session", body: PlanSessionInput, status: 204 },
  { method: "delete", path: "/plan/sessions/{id}", tag: "plan", summary: "Delete a planned session", status: 204 },
  { method: "post", path: "/plan/copy-week", tag: "plan", summary: "Copy a Monday-start week forward N weeks", body: CopyWeekInput, response: z.object({ created: z.number() }) },
  { method: "get", path: "/plan/phases", tag: "plan", summary: "All phases", response: z.object({ phases: z.array(PhaseDto) }) },
  { method: "post", path: "/plan/phases", tag: "plan", summary: "Add a phase", body: PhaseInput, response: Created, status: 201 },
  { method: "put", path: "/plan/phases/{id}", tag: "plan", summary: "Replace a phase", body: PhaseInput, status: 204 },
  { method: "delete", path: "/plan/phases/{id}", tag: "plan", summary: "Delete a phase", status: 204 },
  { method: "get", path: "/questionnaires", tag: "questionnaires", summary: "All forms with due status, streak and last answer",
    response: z.object({ questionnaires: z.array(QuestionnaireDto.extend({ due: z.boolean(), streakDays: z.number().nullable(), lastAnswered: z.string().nullable() })) }) },
  { method: "get", path: "/questionnaires/{slug}", tag: "questionnaires", summary: "One form definition", response: QuestionnaireDto },
  { method: "put", path: "/questionnaires/{slug}", tag: "questionnaires", summary: "Create or replace a form definition (items change -> new version)", body: DefSchema, response: QuestionnaireDto },
  { method: "get", path: "/questionnaires/{slug}/responses", tag: "questionnaires", summary: "Responses in a window", query: WindowQuery, response: Window("responses", ResponseDto) },
  { method: "put", path: "/questionnaires/{slug}/responses/{date}", tag: "questionnaires", summary: "Answer a form for a date (replaces an earlier answer)", body: AnswersBody, response: ResponseDto },
  { method: "get", path: "/wellness", tag: "questionnaires", summary: "Daily wellness composite and item scores (0-1, 1 = favourable)", query: WindowQuery, response: Window("days", WellnessDto) },
  { method: "get", path: "/push/config", tag: "push", summary: "Web Push public key (VAPID), subscription count and reminder settings",
    response: z.object({ publicKey: z.string(), subscriptions: z.number(), reminders: SettingsSchema.shape.reminders }) },
  { method: "post", path: "/push/subscriptions", tag: "push", summary: "Register a browser push subscription (PWA). Native apps will use APNs/FCM instead.", body: PushSubscriptionBody, status: 204 },
  { method: "delete", path: "/push/subscriptions", tag: "push", summary: "Remove a push subscription", query: EndpointQuery, status: 204 },
  { method: "post", path: "/push/test", tag: "push", summary: "Send a test notification to every subscribed device", response: z.object({ sent: z.number(), failed: z.number() }) },
  { method: "get", path: "/settings", tag: "settings", summary: "All tuning knobs", response: SettingsSchema },
  { method: "patch", path: "/settings", tag: "settings", summary: "Deep-merge patch; the whole result is validated", body: SettingsPatch, response: SettingsSchema },
];

function schema(t: z.ZodType, io: "input" | "output") {
  return z.toJSONSchema(t, { io, unrepresentable: "any", target: "openapi-3.0" });
}

const ErrorBody = z.object({ error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }) });

export function openApiDocument(serverUrl: string) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const r of ROUTES) {
    const params: unknown[] = [...r.path.matchAll(/\{(\w+)\}/g)].map((m) => ({ name: m[1], in: "path", required: true, schema: { type: "string" } }));
    if (r.query) {
      for (const [name, s] of Object.entries(r.query.shape)) {
        params.push({ name, in: "query", required: !(s as z.ZodType).safeParse(undefined).success, schema: schema(s as z.ZodType, "input") });
      }
    }
    const status = String(r.status ?? 200);
    paths[r.path] ??= {};
    paths[r.path][r.method] = {
      tags: [r.tag],
      summary: r.summary,
      ...(r.public ? { security: [] } : {}),
      ...(params.length ? { parameters: params } : {}),
      ...(r.body ? { requestBody: { required: true, content: { "application/json": { schema: schema(r.body, "input") } } } } : {}),
      responses: {
        [status]: r.response ? { description: "OK", content: { "application/json": { schema: schema(r.response, "output") } } } : { description: status === "204" ? "No content" : "OK" },
        default: { description: "Error", content: { "application/json": { schema: schema(ErrorBody, "output") } } },
      },
    };
  }
  return {
    openapi: "3.0.3",
    info: {
      title: "AthleteOS API",
      version: "1.0.0",
      description: "Personal athlete-management API. Device data comes from Open Wearables; every device value names its device. Dates are YYYY-MM-DD in the athlete's timezone.",
    },
    servers: [{ url: serverUrl }],
    components: { securitySchemes: { bearer: { type: "http", scheme: "bearer", description: "Token from POST /auth/token or Settings → API tokens" } } },
    security: [{ bearer: [] }],
    paths,
  };
}
