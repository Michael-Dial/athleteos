// Single-user session: an HMAC-signed cookie. Uses Web Crypto so the same code
// runs in proxy.ts and route handlers. Password checks live in signin.ts.

export const SESSION_COOKIE = "aos_session";
/**
 * An admin's "see it as a participant" switch. It only narrows what the admin
 * sees and may do (never widens it), so it needs no signature: a member who
 * sets it by hand gets exactly what they already had.
 */
export const MEMBER_VIEW_COOKIE = "aos_as_member";
const SESSION_DAYS = 30;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set (>= 32 chars)");
  return s;
}

export function authDisabled(): boolean {
  // Explicit opt-out for LAN-only installs; the public tunnel must never use it.
  return process.env.AUTH_DISABLED === "true";
}

const te = new TextEncoder();

export async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", te.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, te.encode(data)));
  return Buffer.from(sig).toString("base64url");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/**
 * Session tokens name the user and carry that user's session epoch; bumping it
 * (password change, "sign out other devices", disabling the user) ends every
 * session issued before. Tokens from before per-user sign-in are rejected.
 */
export async function createSessionToken(userId: number, epoch: number, now = Date.now()): Promise<{ token: string; maxAge: number }> {
  const exp = now + SESSION_DAYS * 86400_000;
  const payload = `v3.${exp}.${userId}.${epoch}`;
  return { token: `${payload}.${await hmac(payload)}`, maxAge: SESSION_DAYS * 86400 };
}

/** The user id and epoch a token claims, if its signature and expiry hold; the caller checks the epoch. */
export async function readSessionToken(token: string | undefined, now = Date.now()): Promise<{ userId: number; epoch: number } | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 5 || parts[0] !== "v3") return null;
  const exp = Number(parts[1]);
  const userId = Number(parts[2]);
  const epoch = Number(parts[3]);
  if (!Number.isFinite(exp) || exp < now || !Number.isInteger(userId) || !Number.isInteger(epoch)) return null;
  if (!timingSafeEqual(parts[4], await hmac(parts.slice(0, 4).join(".")))) return null;
  return { userId, epoch };
}

// ---------- email sign-in codes ----------

export const TRUST_COOKIE = "aos_trust";
export const CHALLENGE_COOKIE = "aos_challenge";
export const TRUST_DAYS = 30;

/**
 * A device that completed a code is trusted for TRUST_DAYS. The token carries
 * the user's trust epoch, so bumping it ("forget all devices") revokes every
 * device that user trusted at once, without a table of devices.
 */
export async function createTrustToken(userId: number, epoch: number, now = Date.now()): Promise<{ token: string; maxAge: number }> {
  const exp = now + TRUST_DAYS * 86400_000;
  const nonce = crypto.getRandomValues(new Uint8Array(9));
  const payload = `t2.${exp}.${userId}.${epoch}.${Buffer.from(nonce).toString("base64url")}`;
  return { token: `${payload}.${await hmac(payload)}`, maxAge: TRUST_DAYS * 86400 };
}

/** A browser stays trusted for the user who confirmed a code on it, until that user's trust epoch moves. */
export async function verifyTrustToken(token: string | undefined, userId: number, epoch: number, now = Date.now()): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 6 || parts[0] !== "t2") return false;
  const exp = Number(parts[1]);
  if (!Number.isFinite(exp) || exp < now || Number(parts[2]) !== userId || Number(parts[3]) !== epoch) return false;
  return timingSafeEqual(parts[5], await hmac(parts.slice(0, 5).join(".")));
}

/** Hash for a one-time code, bound to its challenge so a code can't be replayed elsewhere. */
export function codeHash(challengeId: string, code: string): Promise<string> {
  return hmac(`code:${challengeId}:${code}`);
}

export { timingSafeEqual };

/** "m•••@g•••.com": enough to recognise the address, not enough to harvest it. */
export function maskEmail(email: string): string {
  const [user, domain = ""] = email.split("@");
  const dot = domain.lastIndexOf(".");
  const host = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 ? domain.slice(dot) : "";
  return `${user.slice(0, 1)}•••@${host.slice(0, 1)}•••${tld}`;
}
