import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { getCtx } from "@/lib/domain/context";
import { requireUser } from "@/lib/current-user";
import { getConnections, listProviders } from "@/lib/ow/api";
import type { OwConnection } from "@/lib/ow/types";
import { phoneProvidersFor, platformOf } from "@/lib/platform";
import { getDef } from "@/lib/domain/questionnaires";
import { getIosAppUrl, getPhoneApp, getPhoneCode } from "@/lib/domain/phone-code";
import { vapidKeys } from "@/lib/push/webpush";
import { todayIn } from "@/lib/dates";
import { ReadinessGauge } from "@/components/viz";
import { QuestionnaireForm } from "@/components/questionnaire-form";
import { PushToggle } from "@/components/push-toggle";
import { InstallSteps } from "@/components/pwa";
import { Notice } from "@/components/ui";
import { IconCalendar, IconCheck, IconLogo, IconPulse, IconWatch } from "@/components/icons";
import { connectProvider, finishOnboarding } from "../(app)/actions";

export const metadata: Metadata = { title: "Welcome" };
export const dynamic = "force-dynamic";

// First-run setup: a full-screen sequence, one task per screen, every step
// skippable and revisitable. Value first; the notification permission is
// asked only on its own step, after saying why.
const STEPS = ["welcome", "connect", "checkin", "reminders", "install"] as const;
type Step = (typeof STEPS)[number];

function Frame({ step, children, actions }: { step: Step; children: React.ReactNode; actions: React.ReactNode }) {
  const i = STEPS.indexOf(step);
  return (
    <main className="onboard">
      <div className="onboard-top">
        {i > 0 ? <Link href={`/welcome?step=${STEPS[i - 1]}`} className="link-btn" style={{ display: "inline-flex", alignItems: "center", minWidth: 44 }}>Back</Link> : <span className="brand"><IconLogo size={22} />AthleteOS</span>}
        <div className="onboard-dots" aria-label={`Step ${i + 1} of ${STEPS.length}`} role="img">{STEPS.map((s, j) => <i key={s} className={j === i ? "on" : undefined} />)}</div>
        <form action={finishOnboarding}><button className="link-btn" type="submit">Skip setup</button></form>
      </div>
      <div className="onboard-body">{children}</div>
      <div className="onboard-actions">{actions}</div>
    </main>
  );
}

const next = (step: Step) => `/welcome?step=${STEPS[STEPS.indexOf(step) + 1]}`;

async function attempt<T>(fn: () => Promise<T>): Promise<T | null> {
  try { return await fn(); } catch { return null; }
}

export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ step?: string; connected?: string; error?: string }> }) {
  const sp = await searchParams;
  const step: Step = (STEPS as readonly string[]).includes(sp.step ?? "") ? (sp.step as Step) : "welcome";
  const [user, ctx] = await Promise.all([requireUser(), getCtx()]);
  const first = ctx.athlete.name.split(" ")[0];

  if (step === "welcome") {
    return (
      <Frame step={step} actions={<Link className="btn primary" href={next(step)}>Get started</Link>}>
        <h1>Welcome, {first}</h1>
        <div className="card" style={{ display: "grid", placeItems: "center", padding: "18px 12px 6px" }} aria-hidden="true">
          <ReadinessGauge index={0.9} state="ok" label="Ready" zFlag={ctx.settings.baselines.zFlag} watchZ={ctx.settings.readiness.watchZ} size={220} />
          <p className="small muted" style={{ marginTop: 4 }}>An example of your morning readiness</p>
        </div>
        <ul className="value-list">
          <li><IconPulse size={22} /><span><b>Ready or back off, each morning.</b> HRV, resting heart rate, sleep and how you feel, against your own normal ranges.</span></li>
          <li><IconCalendar size={22} /><span><b>Plan against what you actually did.</b> Sessions from every device, counted once.</span></li>
          <li><IconWatch size={22} /><span><b>Every number names its device,</b> so a new watch never looks like a change in you.</span></li>
        </ul>
        <p className="small muted">Setup takes about two minutes. Every step can be skipped and changed later in Settings.</p>
      </Frame>
    );
  }

  if (step === "connect") {
    const h = await headers();
    const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
    const platform = platformOf(h.get("user-agent"));
    const [providers, conns, phoneCode, phoneApp, iosAppUrl] = await Promise.all([
      ctx.owConfigured ? attempt(listProviders) : null,
      ctx.ow ? attempt(() => getConnections(ctx.ow!)) : null,
      getPhoneCode(ctx.athlete.id),
      getPhoneApp(),
      getIosAppUrl(),
    ]);
    const enabled = (providers ?? []).filter((p) => p.is_enabled);
    const phone = phoneProvidersFor(enabled.filter((p) => !p.has_cloud_api), platform);
    const cloud = enabled.filter((p) => p.has_cloud_api && p.credentials_configured);
    const active = new Set((conns ?? []).filter((c: OwConnection) => c.status === "active").map((c) => c.provider));
    const appName = phoneApp.name || "the sync app";
    const linkedAtInvite = !!ctx.athlete.ow_user_id && (conns ?? []).length > 0;
    return (
      <Frame step={step} actions={<><Link className="btn primary" href={next(step)}>{active.size || linkedAtInvite ? "Continue" : "Continue without connecting"}</Link></>}>
        <h1>Connect your devices</h1>
        {sp.connected && <p className="small" role="status" style={{ color: "var(--good)" }}><IconCheck size={14} /> Connected. Data arrives after the first sync, usually within minutes.</p>}
        {sp.error && <Notice kind="bad">{sp.error}</Notice>}
        {linkedAtInvite && <Notice kind="info">Your device history is already connected. Add anything else you wear below.</Notice>}
        {!ctx.owConfigured ? (
          <Notice>Connecting devices isn&apos;t set up on this server yet. You can do it later from Settings → Connected accounts.</Notice>
        ) : (
          <div className="card" style={{ padding: "4px 16px" }}>
            {phone.map((p) => (
              <div key={p.provider} className="connect-row">
                <div className="stack" style={{ gap: 2 }}>
                  <b>{p.name}</b>
                  {active.has(p.provider) ? <span className="small" style={{ color: "var(--good)" }}>Connected</span>
                    : phoneCode.state === "set" ? <span className="small ink2">Install {appName}, open it and enter <code className="mono" style={{ userSelect: "all" }}>{phoneCode.code}</code></span>
                    /* The AthleteOS iPhone app turns on Apple Health in its own setup, signed in as this person; no code. */
                    : p.provider === "apple" && iosAppUrl ? <span className="small ink2">Get the AthleteOS iPhone app and sign in as {user.email}. It asks to turn on Apple Health.</span>
                    : <span className="small muted">Your admin is setting this up. It appears under Settings → Connected accounts when it&apos;s ready.</span>}
                </div>
                {phoneCode.state === "set" && !active.has(p.provider) && phoneApp.installUrl && <a className="btn sm" href={phoneApp.installUrl} target="_blank" rel="noreferrer">Get app</a>}
                {phoneCode.state !== "set" && !active.has(p.provider) && p.provider === "apple" && iosAppUrl && <a className="btn sm" href={iosAppUrl} target="_blank" rel="noreferrer">Get app</a>}
              </div>
            ))}
            {cloud.map((p) => (
              <div key={p.provider} className="connect-row">
                <b>{p.name}</b>
                {active.has(p.provider) ? <span className="small" style={{ color: "var(--good)" }}><IconCheck size={14} /> Connected</span> : (
                  <form action={connectProvider}>
                    <input type="hidden" name="provider" value={p.provider} />
                    <input type="hidden" name="origin" value={origin} />
                    <input type="hidden" name="return" value="welcome" />
                    <button className="btn sm" type="submit">Connect</button>
                  </form>
                )}
              </div>
            ))}
            {phone.length + cloud.length === 0 && <p className="small muted" style={{ padding: "12px 0" }}>No devices can be connected yet.</p>}
          </div>
        )}
        <p className="small muted">You sign in on the maker&apos;s site and come straight back here.</p>
      </Frame>
    );
  }

  if (step === "checkin") {
    const def = await getDef(ctx.athlete.id, "morning-wellness");
    const today = todayIn(ctx.settings.timezone);
    return (
      <Frame step={step} actions={<Link className="btn" href={next(step)}>Not now</Link>}>
        <h1>Your first check-in</h1>
        <p className="ink2">Five quick taps each morning: how tired, how well you slept, how sore, how stressed and your mood. It&apos;s one of the five things readiness weighs, and the only one no device can measure.</p>
        {def ? (
          <div className="card"><QuestionnaireForm slug={def.slug} date={today} items={def.items} initial={{}} hideDate continueHref={next(step)} /></div>
        ) : <Notice>The morning check-in isn&apos;t set up for your account. You can skip this step.</Notice>}
      </Frame>
    );
  }

  if (step === "reminders") {
    const { publicKey } = await vapidKeys();
    return (
      <Frame step={step} actions={<Link className="btn" href={next(step)}>Continue</Link>}>
        <h1>A nudge each morning?</h1>
        <p className="ink2">AthleteOS can remind you at {ctx.settings.reminders.morningTime} when the morning check-in is still open. Nothing else, and you can change the time or turn it off in Settings → Notifications.</p>
        <div className="card"><PushToggle publicKey={publicKey} /></div>
        <p className="small muted">Your phone asks for permission when you turn it on. Saying no changes nothing else in the app.</p>
      </Frame>
    );
  }

  const [iosAppUrl, h] = await Promise.all([getIosAppUrl(), headers()]);
  // On an iPhone the app does more than a Home Screen page (Apple Health sync), so it comes first when there is one to offer.
  if (iosAppUrl && platformOf(h.get("user-agent")) === "ios") {
    return (
      <Frame step={step} actions={<form action={finishOnboarding}><button className="btn primary" type="submit" style={{ width: "100%" }}>Finish</button></form>}>
        <h1>Get the iPhone app</h1>
        <p className="ink2">It syncs Apple Health in the background, including from an Apple Watch, and has the same dashboards. Sign in with {user.email} and the password you just chose.</p>
        <a className="btn" href={iosAppUrl} target="_blank" rel="noreferrer" style={{ minHeight: 44 }}>Get AthleteOS for iPhone</a>
        <details className="card">
          <summary className="small">Or put this website on your Home Screen</summary>
          <div className="mt-sm"><InstallSteps /></div>
        </details>
      </Frame>
    );
  }
  return (
    <Frame step={step} actions={<form action={finishOnboarding}><button className="btn primary" type="submit" style={{ width: "100%" }}>Finish</button></form>}>
      <h1>Put AthleteOS on your Home Screen</h1>
      <p className="ink2">It opens full screen like any app, and on iPhone it&apos;s the only way reminders can reach you.</p>
      <div className="card"><InstallSteps /></div>
      <p className="small muted">Signed in as {user.email}.</p>
    </Frame>
  );
}
