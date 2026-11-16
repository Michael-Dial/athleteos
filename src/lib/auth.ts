// Single-user session: a password from the environment and an HMAC-signed
// cookie. Uses Web Crypto so the same code runs in proxy.ts and route handlers.

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

async function hmac(data: string): Promise<string> {
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

export async function createSessionToken(now = Date.now()): Promise<{ token: string; maxAge: number }> {
  const exp = now + SESSION_DAYS * 86400_000;
  const payload = `v1.${exp}`;
  return { token: `${payload}.${await hmac(payload)}`, maxAge: SESSION_DAYS * 86400 };
}

export async function verifySessionToken(token: string | undefined, now = Date.now()): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return false;
  const exp = Number(parts[1]);
  if (!Number.isFinite(exp) || exp < now) return false;
  return timingSafeEqual(parts[2], await hmac(`${parts[0]}.${parts[1]}`));
}

export async function checkPassword(candidate: string): Promise<boolean> {
  const expected = process.env.ATHLETEOS_PASSWORD;
  if (!expected) return false;
  // Compare digests so the comparison length doesn't leak the password length.
  const [a, b] = await Promise.all([hmac(`pw:${candidate}`), hmac(`pw:${expected}`)]);
  return timingSafeEqual(a, b);
}
