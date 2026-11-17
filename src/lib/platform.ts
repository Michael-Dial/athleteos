// Which phone the request comes from, for ordering and filtering the phone
// health apps: Apple Health only exists on iPhone, Health Connect and Samsung
// Health only on Android. Unknown (a desktop browser) shows everything.
export type Platform = "ios" | "android" | null;

export function platformOf(userAgent: string | null): Platform {
  const ua = userAgent ?? "";
  return /iPhone|iPad|iPod/i.test(ua) ? "ios" : /Android/i.test(ua) ? "android" : null;
}

const APPLE = /apple/i;
const ANDROID = /health.?connect|samsung/i;

/** Phone providers this platform can use, its own health store first. */
export function phoneProvidersFor<T extends { provider: string; name: string }>(list: T[], platform: Platform): T[] {
  const key = (p: T) => `${p.provider} ${p.name}`;
  const usable = list.filter((p) => (platform === "ios" ? !ANDROID.test(key(p)) : platform === "android" ? !APPLE.test(key(p)) : true));
  const native = (p: T) => (platform === "ios" ? APPLE.test(key(p)) : platform === "android" ? ANDROID.test(key(p)) : false);
  return usable.sort((a, b) => Number(native(b)) - Number(native(a)));
}
