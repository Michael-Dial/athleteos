import "server-only";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

// Sealing for credentials stored in Postgres. The key is derived from
// SESSION_SECRET rather than kept in the database, so a dump or backup of the
// database alone doesn't reveal them. Changing SESSION_SECRET makes stored
// values unreadable; they then need entering again.

const VERSION = "v1";

function key(): Buffer {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set (>= 32 chars)");
  // A distinct derivation so the sealing key is never the HMAC key itself.
  return Buffer.from(hkdfSync("sha256", s, "athleteos-vault", "credential sealing v1", 32));
}

/** Seal a value; the name is bound in as associated data so sealed values can't be swapped between rows. */
export function seal(name: string, plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  c.setAAD(Buffer.from(name));
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [VERSION, iv.toString("base64url"), ct.toString("base64url"), c.getAuthTag().toString("base64url")].join(".");
}

/** Open a sealed value; null when it was sealed under another key or tampered with. */
export function unseal(name: string, sealed: string): string | null {
  const [v, iv, ct, tag] = sealed.split(".");
  if (v !== VERSION || !iv || ct === undefined || !tag) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    d.setAAD(Buffer.from(name));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

// ---------- password hashing ----------

// scrypt N=2^15, r=8, p=1: ~50 ms per check here, slow enough to make offline
// guessing expensive and fast enough for a sign-in form.
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } satisfies ScryptOptions;

function scrypt(pw: string, salt: Buffer, len: number, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((res, rej) => scryptCb(pw.normalize("NFKC"), salt, len, opts, (e, k) => (e ? rej(e) : res(k))));
}

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const k = await scrypt(pw, salt, 32, SCRYPT);
  return `scrypt.${SCRYPT.N}.${SCRYPT.r}.${SCRYPT.p}.${salt.toString("base64url")}.${k.toString("base64url")}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, hash] = stored.split(".");
  if (alg !== "scrypt" || !salt || !hash) return false;
  const want = Buffer.from(hash, "base64url");
  const got = await scrypt(pw, Buffer.from(salt, "base64url"), want.length, { N: Number(n), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem });
  return got.length === want.length && timingSafeEqual(got, want);
}
