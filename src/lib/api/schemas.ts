import { z } from "zod";
import { AnnotationInput } from "../domain/inputs";
import { DateParam } from "./params";

// Request schemas shared by the route handlers and the OpenAPI generator.

export const TokenRequest = z.object({
  email: z.string().trim().min(3).max(254).describe("The address you sign in with"),
  password: z.string().min(1),
  name: z.string().trim().min(1).max(80).describe("Shown in Settings so you can revoke it, e.g. 'iPhone'"),
});

export const TokenCreate = z.object({ name: z.string().trim().min(1).max(80) });

export const ReadinessQuery = z.object({
  date: DateParam.optional(),
  days: z.coerce.number().int().min(7).max(180).default(42).describe("Length of the trend series"),
});

export const DateQuery = z.object({ date: DateParam.optional() });

export const WindowQuery = z.object({
  start: DateParam.optional().describe("Inclusive; defaults to a window ending at end"),
  end: DateParam.optional().describe("Inclusive; defaults to today in the athlete's timezone"),
});

export const AnnotationPatch = AnnotationInput.omit({ owWorkoutId: true });

export const AnswersBody = z.object({
  answers: z.record(z.string(), z.union([z.number(), z.boolean(), z.string(), z.null()])).describe("Keyed by item key"),
});

export const SettingsPatch = z.record(z.string(), z.unknown()).describe("Deep-merge patch over the current settings");

export const PushSubscriptionBody = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({ p256dh: z.string().min(1).max(500), auth: z.string().min(1).max(500) }),
}).describe("A browser PushSubscription as returned by pushManager.subscribe().toJSON()");

export const EndpointQuery = z.object({ endpoint: z.string().url().max(2000) });

export const ReviewQuery = z.object({ week: DateParam.optional().describe("Any date in the week; defaults to this week (Monday start)") });
export const CoverageQuery = z.object({ days: z.coerce.number().int().min(7).max(120).default(60) });
export const TrendsQuery = z.object({ weeks: z.coerce.number().int().min(4).max(104).default(26) });
export const IllnessQuery = z.object({ date: DateParam.optional(), days: z.coerce.number().int().min(1).max(60).default(21) });

export const ZonesQuery = z.object({
  metric: z.enum(["hr", "pace", "runpower", "bikepower"]).default("hr"),
  sport: z.enum(["all", "run", "ride", "other"]).default("all").describe("Heart rate only; pace and power are fixed to their sport"),
  start: DateParam.optional(),
  end: DateParam.optional(),
});

export const TokenVerifyRequest = z.object({
  challengeId: z.string().uuid(),
  code: z.string().min(6).max(7).describe("The 6-digit code from the email"),
});
