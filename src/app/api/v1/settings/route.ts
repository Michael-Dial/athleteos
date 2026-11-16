import { apiRoute, body } from "@/lib/api/http";
import { patchSettings } from "@/lib/settings";
import { SettingsPatch } from "@/lib/api/schemas";

export const GET = apiRoute(async ({ ctx }) => ctx.settings);

// Deep-merge patch, e.g. {"hrv": {"swcSd": 0.6}}. The merged result is
// validated as a whole; nothing is saved if any field is invalid.
export const PATCH = apiRoute(async ({ req, ctx }) => patchSettings(ctx.athlete.id, await body(req, SettingsPatch)));
