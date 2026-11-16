// AthleteOS service worker.
// Caches only static assets and an offline page. Pages and API responses
// carry health data and are never cached, so nothing sensitive persists on
// the device beyond what the browser already keeps for a normal visit.
const VERSION = "aos-v2"; // bump when precached assets change (new icons)
const PRECACHE = ["/offline.html", "/icons/icon-192.png", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Pages: always the network; the offline page only when it's unreachable.
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match("/offline.html")));
    return;
  }
  // Hashed build assets and icons are immutable: cache-first.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) caches.open(VERSION).then((c) => c.put(req, res.clone()));
        return res;
      })),
    );
  }
});

self.addEventListener("push", (event) => {
  let msg = { title: "AthleteOS", body: "", url: "/" };
  try { msg = { ...msg, ...event.data.json() }; } catch { /* plain-text or empty payload */ }
  event.waitUntil(self.registration.showNotification(msg.title, {
    body: msg.body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: msg.tag,
    data: { url: msg.url },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const open = wins.find((w) => w.url.startsWith(self.location.origin));
      if (open) return open.navigate(target).then((w) => (w || open).focus());
      return self.clients.openWindow(target);
    }),
  );
});
