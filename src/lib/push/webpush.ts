import "server-only";
import webpush from "web-push";
import { q, q1 } from "../db";
import { cred } from "../credentials";
import { startOfWeek, todayIn } from "../dates";
import { loadCtx } from "../domain/context";
import { isDue, listDefs } from "../domain/questionnaires";
import { localHHMM, shouldSendMorning } from "./schedule";

interface Vapid {
  publicKey: string;
  privateKey: string;
}

// Keys from the environment win; otherwise generate once and keep them in the
// database, so push works with zero configuration and survives restarts.
let vapid: Promise<Vapid> | null = null;
export function vapidKeys(): Promise<Vapid> {
  vapid ??= (async () => {
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
      return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
    }
    const stored = await q1<{ value: Vapid }>("SELECT value FROM system_kv WHERE key = 'vapid'");
    if (stored) return stored.value;
    const k = webpush.generateVAPIDKeys();
    // ON CONFLICT keeps whichever process stored keys first.
    await q("INSERT INTO system_kv (key, value) VALUES ('vapid', $1) ON CONFLICT (key) DO NOTHING", [JSON.stringify(k)]);
    return (await q1<{ value: Vapid }>("SELECT value FROM system_kv WHERE key = 'vapid'"))!.value;
  })().catch((e) => {
    vapid = null;
    throw e;
  });
  return vapid;
}

export interface SubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export async function saveSubscription(athleteId: number, s: SubscriptionInput, userAgent: string | null): Promise<void> {
  await q(
    `INSERT INTO push_subscription (athlete_id, endpoint, p256dh, auth, user_agent) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (endpoint) DO UPDATE SET athlete_id = EXCLUDED.athlete_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
       user_agent = EXCLUDED.user_agent, failures = 0`,
    [athleteId, s.endpoint, s.keys.p256dh, s.keys.auth, userAgent?.slice(0, 300) ?? null],
  );
}

export async function deleteSubscription(athleteId: number, endpoint: string): Promise<boolean> {
  return !!(await q1("DELETE FROM push_subscription WHERE athlete_id = $1 AND endpoint = $2 RETURNING id", [athleteId, endpoint]));
}

export async function countSubscriptions(athleteId: number): Promise<number> {
  return (await q1<{ n: number }>("SELECT count(*)::int AS n FROM push_subscription WHERE athlete_id = $1", [athleteId]))!.n;
}

export interface PushMessage {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

/** Send to every subscription of an athlete; gone subscriptions are pruned. */
export async function sendToAthlete(athleteId: number, msg: PushMessage): Promise<{ sent: number; failed: number }> {
  const keys = await vapidKeys();
  const subject = (await cred("VAPID_SUBJECT")) || "mailto:admin@localhost";
  const subs = await q<{ id: number; endpoint: string; p256dh: string; auth: string }>(
    "SELECT id, endpoint, p256dh, auth FROM push_subscription WHERE athlete_id = $1", [athleteId]);
  let sent = 0, failed = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(msg),
        { vapidDetails: { subject, publicKey: keys.publicKey, privateKey: keys.privateKey }, TTL: 6 * 3600 },
      );
      sent++;
      await q("UPDATE push_subscription SET last_success_at = now(), failures = 0 WHERE id = $1", [s.id]);
    } catch (e) {
      failed++;
      const status = (e as { statusCode?: number }).statusCode;
      // 404/410: the browser dropped the subscription; anything else may be transient.
      if (status === 404 || status === 410) await q("DELETE FROM push_subscription WHERE id = $1", [s.id]);
      else await q("UPDATE push_subscription SET failures = failures + 1 WHERE id = $1", [s.id]);
    }
  }
  return { sent, failed };
}

/** One scheduler tick: send due morning reminders. Safe to run on several replicas. */
export async function runReminderTick(now = new Date()): Promise<void> {
  const athletes = await q<{ athlete_id: number }>("SELECT DISTINCT athlete_id FROM push_subscription");
  for (const { athlete_id } of athletes) {
    const ctx = await loadCtx(athlete_id);
    const r = ctx.settings.reminders;
    const tz = ctx.settings.timezone;
    const date = todayIn(tz, now);
    const sentRow = await q1("SELECT 1 FROM reminder_log WHERE athlete_id = $1 AND kind = 'morning' AND date = $2", [athlete_id, date]);
    const defs = (await listDefs(athlete_id)).filter((d) => d.schedule === "daily");
    const due: string[] = [];
    for (const d of defs) if (await isDue(d, date, startOfWeek(date))) due.push(d.name);
    if (!shouldSendMorning({ enabled: r.morningEnabled, nowHHMM: localHHMM(now, tz), time: r.morningTime, lateWindowHours: r.lateWindowHours, dueForms: due.length, alreadySent: !!sentRow })) continue;
    // Claim the day first: if two processes race, only the insert winner sends.
    const claimed = await q1("INSERT INTO reminder_log (athlete_id, kind, date) VALUES ($1, 'morning', $2) ON CONFLICT DO NOTHING RETURNING 1", [athlete_id, date]);
    if (!claimed) continue;
    const first = defs.find((d) => due.includes(d.name))!;
    await sendToAthlete(athlete_id, {
      title: "Morning check-in",
      body: due.length === 1 ? `${due[0]} is ready. It takes under a minute.` : `${due.length} forms are ready: ${due.join(", ")}.`,
      url: `/wellness/${first.slug}`,
      tag: `morning-${date}`,
    });
  }
}
