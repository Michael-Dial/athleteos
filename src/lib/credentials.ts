import "server-only";
import { q, tx } from "./db";
import { seal, unseal } from "./vault";

// Credentials can be entered in Settings → Credentials (stored sealed in
// Postgres) or come from the environment. A value saved in the app wins; the
// environment is the fallback, so an existing .env keeps working and a fresh
// install only needs SESSION_SECRET, ATHLETEOS_PASSWORD and the database.

export type CredGroup = "ow" | "smtp" | "signin" | "push";

export interface CredDef {
  group: CredGroup;
  label: string;
  /** Secrets are write-only in the UI: never sent back to the browser. */
  secret: boolean;
  /** For keys, show the last 4 characters so you can tell which one is saved. */
  last4?: boolean;
  hint?: string;
  placeholder?: string;
  type?: "text" | "email" | "url" | "number";
  /** Where the group's secrets are sent: a new value here receives the saved ones. */
  destination?: boolean;
}

export const CREDENTIALS = {
  OW_API_BASE: { group: "ow", label: "API base URL", secret: false, destination: true, type: "url", placeholder: "http://192.168.8.222:8000/api/v1" },
  OW_API_KEY: { group: "ow", label: "API key", secret: true, last4: true, hint: "Preferred. Used for all data reads when set." },
  OW_EMAIL: { group: "ow", label: "Developer email", secret: false, type: "email", hint: "Used when there is no API key, and to create the AthleteOS application." },
  OW_PASSWORD: { group: "ow", label: "Developer password", secret: true },
  SMTP_HOST: { group: "smtp", label: "SMTP host", secret: false, destination: true, placeholder: "smtp-relay.brevo.com" },
  SMTP_PORT: { group: "smtp", label: "Port", secret: false, destination: true, type: "number", placeholder: "587", hint: "587 uses STARTTLS (required); 465 uses implicit TLS." },
  SMTP_USER: { group: "smtp", label: "Username", secret: false },
  SMTP_PASS: { group: "smtp", label: "Password or SMTP key", secret: true },
  SMTP_FROM: { group: "smtp", label: "From", secret: false, placeholder: "AthleteOS <alerts@example.com>", hint: "Must be a sender your provider has verified." },
  LOGIN_EMAIL: { group: "signin", label: "Code address", secret: false, type: "email" },
  LOGIN_2FA: { group: "signin", label: "Emailed codes", secret: false },
  VAPID_SUBJECT: { group: "push", label: "Push contact", secret: false, placeholder: "mailto:you@example.com", hint: "Push services may use it to reach the sender. A mailto: or https: URL." },
} as const satisfies Record<string, CredDef>;

export type CredName = keyof typeof CREDENTIALS;
/** Stored values that are not edited as fields: the sign-in password hash and the OW application. */
type InternalName = "APP_PASSWORD_HASH" | "OW_APPLICATION";
export type StoreName = CredName | InternalName;

export const CRED_NAMES = Object.keys(CREDENTIALS) as CredName[];

/**
 * Whether trying a form's settings would hand a saved secret to an address
 * other than the saved one: a destination changed while a secret the form left
 * blank (so the saved one is used) has a saved value. Testing that needs the
 * person's password, like saving does; testing the saved address, or only
 * secrets typed into the form, does not.
 */
export function testSendsSavedSecretElsewhere(changed: ReadonlySet<CredName>, savedSecrets: ReadonlySet<CredName>): boolean {
  const def = (n: CredName): CredDef => CREDENTIALS[n];
  const newDestination = [...changed].some((n) => def(n).destination);
  const reusesSaved = [...savedSecrets].some((n) => def(n).secret && !changed.has(n));
  return newDestination && reusesSaved;
}

interface Loaded {
  at: number;
  values: Map<string, string>;
  /** Rows that wouldn't open: sealed under a different SESSION_SECRET. */
  unreadable: string[];
}

// Re-read at most every 30 s so a second replica sees changes; writes in this
// process clear it immediately.
const TTL_MS = 30_000;
const g = globalThis as unknown as { __aosCreds?: Promise<Loaded> & { at?: number } };

async function load(): Promise<Loaded> {
  // Unit tests and tooling run without a database: environment only.
  if (!process.env.DATABASE_URL) return { at: Date.now(), values: new Map(), unreadable: [] };
  const rows = await q<{ name: string; sealed: string }>("SELECT name, sealed FROM credential");
  const values = new Map<string, string>();
  const unreadable: string[] = [];
  for (const r of rows) {
    const v = unseal(r.name, r.sealed);
    if (v === null) unreadable.push(r.name);
    else values.set(r.name, v);
  }
  return { at: Date.now(), values, unreadable };
}

function loaded(): Promise<Loaded> {
  const cur = g.__aosCreds;
  if (cur && cur.at !== undefined && Date.now() - cur.at < TTL_MS) return cur;
  const p = load() as Promise<Loaded> & { at?: number };
  p.at = Date.now();
  p.catch(() => { if (g.__aosCreds === p) g.__aosCreds = undefined; });
  g.__aosCreds = p;
  return p;
}

export function forgetCredentialCache(): void {
  g.__aosCreds = undefined;
}

/** The value saved in the app, ignoring the environment. */
export async function stored(name: StoreName): Promise<string | undefined> {
  return (await loaded()).values.get(name);
}

function envValue(name: CredName): string | undefined {
  const v = process.env[name]?.trim();
  return v ? v : undefined;
}

/** Effective value: saved in the app, else the environment. */
export async function cred(name: CredName): Promise<string | undefined> {
  const v = await stored(name);
  return v !== undefined && v !== "" ? v : envValue(name);
}

export interface CredState {
  name: CredName;
  def: CredDef;
  source: "app" | "env" | null;
  /** Non-secret values only. */
  value?: string;
  /** Secrets: "••••abcd" for keys, "••••••" otherwise. */
  masked?: string;
  /** An env value exists underneath the app value (clearing falls back to it). */
  envFallback: boolean;
}

export async function credentialStates(): Promise<{ states: Record<CredName, CredState>; unreadable: string[] }> {
  const l = await loaded();
  const states = {} as Record<CredName, CredState>;
  for (const name of CRED_NAMES) {
    const def: CredDef = CREDENTIALS[name];
    const app = l.values.get(name);
    const env = envValue(name);
    const v = app || env;
    const source = app ? "app" : env ? "env" : null;
    states[name] = {
      name, def, source, envFallback: Boolean(env),
      ...(v === undefined ? {} : def.secret ? { masked: def.last4 && v.length > 8 ? `••••${v.slice(-4)}` : "••••••" } : { value: v }),
    };
  }
  return { states, unreadable: l.unreadable };
}

/** Save (string) or remove (null) values in one transaction. */
export async function writeCredentials(changes: Partial<Record<StoreName, string | null>>): Promise<void> {
  const entries = Object.entries(changes) as [StoreName, string | null | undefined][];
  if (entries.length === 0) return;
  await tx(async (c) => {
    for (const [name, v] of entries) {
      if (v === undefined) continue;
      if (v === null) await c.query("DELETE FROM credential WHERE name = $1", [name]);
      else await c.query(
        `INSERT INTO credential (name, sealed, updated_at) VALUES ($1, $2, now())
         ON CONFLICT (name) DO UPDATE SET sealed = EXCLUDED.sealed, updated_at = now()`, [name, seal(name, v)]);
    }
  });
  forgetCredentialCache();
}
