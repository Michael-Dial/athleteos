import "server-only";
import { probeSmtp, smtpConfig } from "./mail";
import { owConfig, probeOw } from "./ow/client";

// Testing the services AthleteOS depends on, shared by Settings → Credentials
// and the iPhone app's admin screen. Only the settings already in effect are
// tested: nothing from the caller reaches the probe except which service, so
// a stored key or password can only go to the host it is configured for, and
// no password is asked for.

export const SERVICES = ["ow", "smtp"] as const;
export type Service = (typeof SERVICES)[number];

export const SERVICE_NAME: Record<Service, string> = { ow: "Open Wearables", smtp: "Email (SMTP)" };

export interface ServiceState {
  id: Service;
  name: string;
  configured: boolean;
  /** Where it connects, without credentials (OW base URL, SMTP host:port). */
  target: string | null;
}

export interface ServiceTest {
  service: Service;
  ok: boolean;
  message: string;
  testedAt: string;
  durationMs: number;
}

export function isService(s: string): s is Service {
  return (SERVICES as readonly string[]).includes(s);
}

export async function serviceStates(): Promise<ServiceState[]> {
  const [ow, smtp] = await Promise.all([owConfig(), smtpConfig()]);
  return [
    { id: "ow", name: SERVICE_NAME.ow, configured: !!ow, target: ow?.base ?? null },
    { id: "smtp", name: SERVICE_NAME.smtp, configured: !!smtp, target: smtp ? `${smtp.host}:${smtp.port}` : null },
  ];
}

export async function testService(service: Service): Promise<ServiceTest> {
  const testedAt = new Date().toISOString();
  const started = Date.now();
  const done = (ok: boolean, message: string): ServiceTest => ({ service, ok, message, testedAt, durationMs: Date.now() - started });
  if (service === "ow") {
    const c = await owConfig();
    if (!c) return done(false, "Not set up: add the API base URL and an API key or a developer login in Settings → Credentials.");
    const err = await probeOw(c);
    if (err) return done(false, err);
    const how = c.apiKey && c.email && c.password ? "API key and developer login" : c.apiKey ? "API key" : "developer login";
    return done(true, `Connected to ${c.base} with the ${how}.`);
  }
  const c = await smtpConfig();
  if (!c) return done(false, "Not set up: add an SMTP host and From address in Settings → Credentials.");
  const err = await probeSmtp(c);
  if (err) return done(false, `${c.host}:${c.port}: ${err}`);
  return done(true, `Connected to ${c.host}:${c.port}${c.user ? " and logged in" : ""}. Nothing was sent.`);
}
