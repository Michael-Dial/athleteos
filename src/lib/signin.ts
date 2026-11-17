import "server-only";
import { hmac, timingSafeEqual } from "./auth";
import { cred, stored, writeCredentials } from "./credentials";
import { hashPassword, verifyPassword } from "./vault";

export const MIN_PASSWORD_LENGTH = 12;

/** Where the sign-in password comes from: set in the app, or ATHLETEOS_PASSWORD. */
export async function passwordSource(): Promise<"app" | "env" | null> {
  if (await stored("APP_PASSWORD_HASH")) return "app";
  return process.env.ATHLETEOS_PASSWORD ? "env" : null;
}

export async function checkPassword(candidate: string): Promise<boolean> {
  const hash = await stored("APP_PASSWORD_HASH");
  if (hash) return verifyPassword(candidate, hash);
  const expected = process.env.ATHLETEOS_PASSWORD;
  if (!expected) return false;
  // Compare digests so the comparison length doesn't leak the password length.
  const [a, b] = await Promise.all([hmac(`pw:${candidate}`), hmac(`pw:${expected}`)]);
  return timingSafeEqual(a, b);
}

/** Replaces ATHLETEOS_PASSWORD from here on; only a scrypt hash is kept. */
export async function setPassword(pw: string): Promise<void> {
  await writeCredentials({ APP_PASSWORD_HASH: await hashPassword(pw) });
}

/**
 * LOGIN_2FA=off in the environment always wins: it is the way back in if
 * email breaks while codes are on. Otherwise the app setting, then the env.
 */
export function codesForcedOff(): boolean {
  return process.env.LOGIN_2FA?.trim().toLowerCase() === "off";
}

export async function loginCodeRequired(): Promise<boolean> {
  if (codesForcedOff()) return false;
  return (await cred("LOGIN_2FA")) === "email";
}
