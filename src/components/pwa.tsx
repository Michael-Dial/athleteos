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

const DISMISS_KEY = "aos-install-hint-dismissed";

/**
 * iOS has no install prompt and only delivers web push to home-screen apps,
 * so tell iPhone users how to install. Hidden once installed or dismissed.
 */
export function InstallHint() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
    let dismissed = false;
    try { dismissed = localStorage.getItem(DISMISS_KEY) === "1"; } catch { /* storage blocked */ }
    setShow(ios && !standalone && !dismissed);
  }, []);
  if (!show) return null;
  return (
    <div className="notice" role="status">
      <div className="row between" style={{ width: "100%" }}>
        <span className="small">Install AthleteOS: tap <b>Share</b>, then <b>Add to Home Screen</b>. Reminders need the installed app on iPhone.</span>
        <button className="btn sm" onClick={() => { try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* storage blocked */ } setShow(false); }}>Dismiss</button>
      </div>
    </div>
  );
}
