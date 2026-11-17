// Single-user session: an HMAC-signed cookie. Uses Web Crypto so the same code
// runs in proxy.ts and route handlers. Password checks live in signin.ts.

export const SESSION_COOKIE = "aos_session";
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
 * Session tokens carry the session epoch; bumping it (password change, "sign
 * out other devices") ends every session issued before. v1 tokens predate the
 * epoch and are honoured only while it has never been bumped.
 */
export async function createSessionToken(epoch: number, now = Date.now()): Promise<{ token: string; maxAge: number }> {
  const exp = now + SESSION_DAYS * 86400_000;
  const payload = `v2.${exp}.${epoch}`;
  return { token: `${payload}.${await hmac(payload)}`, maxAge: SESSION_DAYS * 86400 };
}

export async function verifySessionToken(token: string | undefined, epoch: number, now = Date.now()): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts[0] === "v1" && parts.length === 3) {
    if (epoch !== 0) return false;
  } else if (parts[0] !== "v2" || parts.length !== 4 || Number(parts[2]) !== epoch) {
    return false;
  }
  const exp = Number(parts[1]);
  if (!Number.isFinite(exp) || exp < now) return false;
  return timingSafeEqual(parts[parts.length - 1], await hmac(parts.slice(0, -1).join(".")));
}

// ---------- email sign-in codes ----------

export const TRUST_COOKIE = "aos_trust";
export const CHALLENGE_COOKIE = "aos_challenge";
export const TRUST_DAYS = 30;

/**
 * A device that completed a code is trusted for TRUST_DAYS. The token carries
 * the trust epoch, so bumping the epoch ("forget all devices") revokes every
 * trusted device at once without a table of devices.
 */
export async function createTrustToken(epoch: number, now = Date.now()): Promise<{ token: string; maxAge: number }> {
  const exp = now + TRUST_DAYS * 86400_000;
  const nonce = crypto.getRandomValues(new Uint8Array(9));
  const payload = `t1.${exp}.${epoch}.${Buffer.from(nonce).toString("base64url")}`;
  return { token: `${payload}.${await hmac(payload)}`, maxAge: TRUST_DAYS * 86400 };
}

export async function verifyTrustToken(token: string | undefined, epoch: number, now = Date.now()): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 5 || parts[0] !== "t1") return false;
  const exp = Number(parts[1]);
  if (!Number.isFinite(exp) || exp < now || Number(parts[2]) !== epoch) return false;
  return timingSafeEqual(parts[4], await hmac(parts.slice(0, 4).join(".")));
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
