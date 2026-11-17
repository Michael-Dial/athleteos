import "server-only";
import type { AppCtx } from "./context";
import { getConnections, listProviders } from "../ow/api";
import type { OwConnection } from "../ow/types";
import { errorMessage } from "./errors";

// The athlete's view of their device accounts, shared by the web page and the
// app API. Brands and statuses only: no backend user ids, no provider setup.

export type AccountStatus = "connected" | "lapsed" | "none";

export interface ServiceView {
  provider: string;
  name: string;
  /** cloud: OAuth on the maker's site. phone: synced from the phone's health store by the app. */
  kind: "cloud" | "phone";
  status: AccountStatus;
  /** Active accounts of this service. */
  count: number;
  lastSyncedAt: string | null;
}

export interface AccountView {
  id: string;
  provider: string;
  name: string;
  label: string;
  device: string | null;
  status: "connected" | "expired" | "disconnected";
  lastSyncedAt: string | null;
  canSync: boolean;
}

export interface AccountsView {
  services: ServiceView[];
  accounts: AccountView[];
  errors: string[];
}

function serviceStatus(provider: string, conns: OwConnection[]): Pick<ServiceView, "status" | "count" | "lastSyncedAt"> {
  const mine = conns.filter((c) => c.provider === provider);
  const active = mine.filter((c) => c.status === "active");
  if (active.length) {
    const last = active.map((c) => c.last_synced_at).filter((x): x is string => !!x).sort().at(-1) ?? null;
    return { status: "connected", count: active.length, lastSyncedAt: last };
  }
  return { status: mine.length ? "lapsed" : "none", count: 0, lastSyncedAt: null };
}

export async function accountsView(ctx: AppCtx): Promise<AccountsView> {
  const errors: string[] = [];
  const [providers, conns] = await Promise.all([
    listProviders().catch((e) => { errors.push(errorMessage(e)); return []; }),
    ctx.ow ? getConnections(ctx.ow).catch((e) => { errors.push(errorMessage(e)); return [] as OwConnection[]; }) : Promise.resolve([] as OwConnection[]),
  ]);
  const enabled = providers.filter((p) => p.is_enabled);
  const nameOf = new Map(enabled.map((p) => [p.provider, p.name]));
  // A cloud provider without client credentials can't complete OAuth; offering
  // it would only end on an error page, so it waits on the admin's list.
  const services: ServiceView[] = enabled
    .filter((p) => !p.has_cloud_api || p.credentials_configured)
    .map((p) => ({ provider: p.provider, name: p.name, kind: p.has_cloud_api ? "cloud" : "phone", ...serviceStatus(p.provider, conns) }));
  const accounts: AccountView[] = conns.map((c) => ({
    id: c.id,
    provider: c.provider,
    name: nameOf.get(c.provider) ?? c.provider,
    label: c.display_label,
    device: c.device_label,
    status: c.status === "active" ? "connected" : c.status === "expired" ? "expired" : "disconnected",
    lastSyncedAt: c.last_synced_at,
    canSync: c.rest_pull && c.status === "active",
  }));
  return { services, accounts, errors };
}

/** Where a provider's OAuth returns: the app's scheme, or the web page on this host. */
export function oauthReturn(target: "app" | "web", provider: string, origin: string): string {
  const p = encodeURIComponent(provider);
  return target === "app" ? `athleteos://accounts/connected?provider=${p}` : `${origin}/settings/accounts?connected=${p}`;
}
