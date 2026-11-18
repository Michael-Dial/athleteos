import "server-only";
import { q, q1 } from "../db";
import { seal, unseal } from "../vault";
import { SettingsSchema } from "../settings";

// The pairing code the athlete types into the phone sync app. It is issued
// per device-data user by the backend admin and pasted in under Settings →
// Data backend. Unlike the install credentials it is shown back, but only to
// the athlete it belongs to: typing it into their phone is its whole purpose.
// It is sealed at rest so a database dump does not hand out write access.

const aad = (athleteId: number) => `athlete:${athleteId}:phone_code`;

export const PHONE_CODE_RE = /^\S{4,128}$/;

export type PhoneCode = { state: "none" } | { state: "set"; code: string } | { state: "unreadable" };

export async function getPhoneCode(athleteId: number): Promise<PhoneCode> {
  const row = await q1<{ phone_code_sealed: string | null }>("SELECT phone_code_sealed FROM athlete WHERE id = $1", [athleteId]);
  if (!row?.phone_code_sealed) return { state: "none" };
  const code = unseal(aad(athleteId), row.phone_code_sealed);
  // Sealed under a previous SESSION_SECRET: say so instead of looking unset.
  return code === null ? { state: "unreadable" } : { state: "set", code };
}

export async function setPhoneCode(athleteId: number, code: string | null): Promise<void> {
  await q("UPDATE athlete SET phone_code_sealed = $1 WHERE id = $2", [code === null ? null : seal(aad(athleteId), code), athleteId]);
}

// The phone sync app (name and install link) is the same for every athlete,
// so it is install-wide. Installs from before users kept it in the first
// athlete's settings; that value is read until an admin saves here.
const PhoneAppSchema = SettingsSchema.shape.phoneApp;
export type PhoneApp = { name: string; installUrl: string };

export async function getPhoneApp(): Promise<PhoneApp> {
  const row = await q1<{ value: unknown }>("SELECT value FROM system_kv WHERE key = 'phone_app'");
  if (row) {
    const p = PhoneAppSchema.safeParse(row.value);
    if (p.success) return p.data;
  }
  const legacy = await q1<{ value: unknown }>("SELECT value FROM settings WHERE key = 'phoneApp' ORDER BY athlete_id LIMIT 1");
  const p = PhoneAppSchema.safeParse(legacy?.value ?? {});
  return p.success ? p.data : { name: "", installUrl: "" };
}

export async function setPhoneApp(v: PhoneApp): Promise<void> {
  const clean = PhoneAppSchema.parse(v);
  await q(`INSERT INTO system_kv (key, value, updated_at) VALUES ('phone_app', $1, now())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, [JSON.stringify(clean)]);
}

// The AthleteOS iPhone app's App Store or TestFlight link. Separate from the
// phone sync app above, which may still serve Android: the iPhone app signs in
// with the athlete's own email and needs no pairing code.
export async function getIosAppUrl(): Promise<string> {
  const row = await q1<{ value: { url?: unknown } }>("SELECT value FROM system_kv WHERE key = 'ios_app'");
  return typeof row?.value.url === "string" ? row.value.url : "";
}

export async function setIosAppUrl(url: string): Promise<void> {
  const clean = url.trim();
  if (clean && !/^https:\/\/\S+$/.test(clean)) throw new Error("Use an https link (App Store or TestFlight).");
  await q(`INSERT INTO system_kv (key, value, updated_at) VALUES ('ios_app', $1, now())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, [JSON.stringify({ url: clean })]);
}
