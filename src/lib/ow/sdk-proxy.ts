// OW is reachable only on the home network; the phone's sync SDK reaches it
// through this server at {origin}/ow/api/v1/…. Only the SDK's own calls pass,
// each authorised by the SDK's per-user token, which OW checks. Everything
// else in OW's API (user listing, provider setup, other users' data) is not
// reachable through here whatever token is sent.

const UUID = "[0-9a-fA-F-]{36}";
const ALLOWED: { method: string; re: RegExp }[] = [
  { method: "POST", re: new RegExp(`^sdk/users/${UUID}/sync$`) },
  { method: "POST", re: new RegExp(`^sdk/users/${UUID}/logs$`) },
  { method: "GET", re: new RegExp(`^sdk/users/${UUID}/beat-capture$`) },
  { method: "POST", re: new RegExp(`^sdk/users/${UUID}/beat-capture/windows/[A-Za-z0-9_-]{1,64}/fulfilled$`) },
  { method: "POST", re: /^token\/refresh$/ },
  // The SDK's sign-out disconnects the phone's Apple Health account.
  { method: "DELETE", re: new RegExp(`^users/${UUID}/connections/apple$`) },
];

export function sdkPathAllowed(method: string, path: string): boolean {
  if (path.includes("..") || path.includes("//")) return false;
  return ALLOWED.some((a) => a.method === method && a.re.test(path));
}

// Request headers OW needs from the SDK. Notably absent: cookies and
// X-Open-Wearables-API-Key, so the proxy never carries an admin credential.
const PASS_REQUEST = ["authorization", "content-type", "content-encoding", "x-open-wearables-sdk-version", "x-open-wearables-sdk-platform",
  "x-open-wearables-outbox-item", "x-open-wearables-app-state", "x-open-wearables-sync-trigger"];
const PASS_RESPONSE = ["content-type", "content-encoding", "retry-after"];

export function forwardRequestHeaders(h: Headers): Headers {
  const out = new Headers();
  for (const k of PASS_REQUEST) { const v = h.get(k); if (v) out.set(k, v); }
  return out;
}

export function forwardResponseHeaders(h: Headers): Headers {
  const out = new Headers();
  for (const k of PASS_RESPONSE) { const v = h.get(k); if (v) out.set(k, v); }
  return out;
}
