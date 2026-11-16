// Modest in-process TTL cache for OW reads. Device data is never persisted in
// Postgres; this only absorbs repeat page loads within a few minutes.
interface Entry {
  exp: number;
  value: Promise<unknown>;
}

const g = globalThis as unknown as { __aosCache?: Map<string, Entry> };
const store = (g.__aosCache ??= new Map());
const MAX_ENTRIES = 500;

export async function cached<T>(key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
  if (ttlSeconds <= 0) return load();
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.exp > now) return hit.value as Promise<T>;
  // Store the promise, not the value, so concurrent requests share one fetch.
  const value = load();
  store.set(key, { exp: now + ttlSeconds * 1000, value });
  value.catch(() => store.delete(key));
  if (store.size > MAX_ENTRIES) {
    for (const [k, e] of store) if (e.exp <= now) store.delete(k);
    while (store.size > MAX_ENTRIES) store.delete(store.keys().next().value as string);
  }
  return value;
}

export function invalidate(prefix = ""): void {
  for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k);
}
