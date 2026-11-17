"use client";
import { useEffect, useState } from "react";

/** Registers the service worker in production builds. */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
  }, []);
  return null;
}

type Where = "loading" | "installed" | "ios" | "android" | "other";

/**
 * The last onboarding step. iOS has no install prompt and only delivers web
 * push to Home Screen apps, so iPhone users get the two taps spelled out;
 * once it runs from the Home Screen there is nothing left to do.
 */
export function InstallSteps() {
  const [where, setWhere] = useState<Where>("loading");
  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
    const ua = navigator.userAgent;
    setWhere(standalone ? "installed" : /iphone|ipad|ipod/i.test(ua) ? "ios" : /android/i.test(ua) ? "android" : "other");
  }, []);
  if (where === "loading") return <p className="small muted">Checking this device…</p>;
  if (where === "installed") return <p className="ink2">AthleteOS is already on your Home Screen. You&apos;re set.</p>;
  if (where === "ios") {
    return (
      <ol className="steps">
        <li>Tap <b>Share</b> <span aria-hidden="true">(the square with an arrow)</span> in Safari&apos;s toolbar.</li>
        <li>Choose <b>Add to Home Screen</b>, then <b>Add</b>.</li>
        <li>Open AthleteOS from your Home Screen. It opens full screen, and reminders work from there.</li>
      </ol>
    );
  }
  if (where === "android") {
    return (
      <ol className="steps">
        <li>Open the browser menu <span aria-hidden="true">(⋮)</span>.</li>
        <li>Choose <b>Install app</b> or <b>Add to Home screen</b>.</li>
      </ol>
    );
  }
  return <p className="ink2">On your phone, open this page in Safari (iPhone) or Chrome (Android) and add it to your Home Screen.</p>;
}
