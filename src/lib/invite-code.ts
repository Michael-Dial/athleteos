import { createHash, randomInt } from "node:crypto";

// Invite codes are read aloud and typed on a phone, so they use Crockford's
// base32 (no I, L, O, U) and forgive the usual misreadings. Ten characters is
// 50 bits; with single use, a 7-day expiry and the sign-in throttle, guessing
// one is not a practical attack.

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const CODE_LENGTH = 10;

export function newInviteCode(): string {
  let s = "";
  for (let i = 0; i < CODE_LENGTH; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return `${s.slice(0, 5)}-${s.slice(5)}`;
}

/** What the athlete typed → the canonical code, or null if it can't be one. */
export function normalizeInviteCode(input: string): string | null {
  const s = input.toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  if (s.length !== CODE_LENGTH || [...s].some((c) => !ALPHABET.includes(c))) return null;
  return `${s.slice(0, 5)}-${s.slice(5)}`;
}

export const hashInviteCode = (canonical: string) => createHash("sha256").update(`athleteos-invite:${canonical}`).digest("hex");
