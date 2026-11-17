import "server-only";
import { q, q1 } from "../db";
import { seal, unseal } from "../vault";

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
