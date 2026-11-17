"use client";
import { useEffect, useState } from "react";
import { inIosApp } from "./pwa";

type Status = "loading" | "unsupported" | "needs-install" | "in-app" | "denied" | "off" | "on";

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(`/api/v1${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok && res.status !== 204) {
    const e = await res.json().catch(() => null);
    throw new Error(e?.error?.message ?? `Request failed (${res.status})`);
  }
  return res.status === 204 ? null : res.json();
}

/** Turn push reminders on or off for this browser/device. */
export function PushToggle({ publicKey }: { publicKey: string }) {
  const [status, setStatus] = useState<Status>("loading");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      if (inIosApp()) return setStatus("in-app");
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        // iOS Safari only exposes push to home-screen apps.
        setStatus(/iphone|ipad|ipod/i.test(navigator.userAgent) ? "needs-install" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") return setStatus("denied");
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      setStatus(sub ? "on" : "off");
    })().catch(() => setStatus("unsupported"));
  }, []);

  async function enable() {
    setBusy(true); setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setStatus(perm === "denied" ? "denied" : "off"); return; }
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
      await api("POST", "/push/subscriptions", sub.toJSON());
      setStatus("on");
      setMsg("Reminders are on for this device.");
    } catch (e) {
      setMsg(`Couldn't turn on notifications: ${(e as Error).message}`);
    } finally { setBusy(false); }
  }

  async function disable() {
    setBusy(true); setMsg(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await api("DELETE", `/push/subscriptions?endpoint=${encodeURIComponent(sub.endpoint)}`).catch(() => null);
        await sub.unsubscribe();
      }
      setStatus("off");
      setMsg("Reminders are off for this device.");
    } finally { setBusy(false); }
  }

  async function test() {
    setBusy(true); setMsg(null);
    try {
      const r = await api("POST", "/push/test");
      setMsg(r.failed ? `Sent to ${r.sent} device(s); ${r.failed} failed.` : `Test sent to ${r.sent} device(s).`);
    } catch (e) {
      setMsg((e as Error).message);
    } finally { setBusy(false); }
  }

  return (
    <div className="stack">
      {status === "loading" && <p className="small muted">Checking this device…</p>}
      {status === "unsupported" && <p className="small">This browser doesn&apos;t support push notifications.</p>}
      {status === "needs-install" && <p className="small">On iPhone, notifications need the installed app: tap <b>Share</b>, then <b>Add to Home Screen</b>, open AthleteOS from the home screen, and come back here.</p>}
      {status === "in-app" && <p className="small">Reminders can&apos;t be sent to the iPhone app yet. To get them, open AthleteOS in Safari, tap <b>Share</b>, then <b>Add to Home Screen</b>, and turn them on there.</p>}
      {status === "denied" && <p className="small">Notifications are blocked for this site. Allow them in the browser&apos;s site settings, then reload.</p>}
      {(status === "off" || status === "on") && (
        <div className="row">
          {status === "off"
            ? <button className="btn primary" onClick={enable} disabled={busy}>Turn on reminders on this device</button>
            : <button className="btn" onClick={disable} disabled={busy}>Turn off on this device</button>}
          {status === "on" && <button className="btn" onClick={test} disabled={busy}>Send a test</button>}
        </div>
      )}
      {msg && <p className="small" role="status">{msg}</p>}
    </div>
  );
}
