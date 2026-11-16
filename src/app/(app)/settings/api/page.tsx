import type { Metadata } from "next";
import { headers } from "next/headers";
import { getCtx } from "@/lib/domain/context";
import { listTokens } from "@/lib/api/tokens";
import { fmtDate, localDate } from "@/lib/dates";
import { Card, Empty } from "@/components/ui";
import { TokenForm } from "@/components/token-form";
import { revokeApiToken } from "../../actions";

export const metadata: Metadata = { title: "API tokens" };

export default async function ApiTokensPage({ searchParams }: { searchParams: Promise<{ revoked?: string }> }) {
  const sp = await searchParams;
  const ctx = await getCtx();
  const tokens = await listTokens(ctx.athlete.id);
  const h = await headers();
  const base = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host")}/api/v1`;
  const day = (iso: string | null) => (iso ? fmtDate(localDate(iso, ctx.settings.timezone), { month: "short", day: "numeric", year: "numeric" }) : "never");
  return (
    <div className="stack-lg">
      {sp.revoked && <p className="small" style={{ color: "var(--good)" }} role="status">Token revoked. Anything using it is signed out.</p>}
      <div className="grid cols-2">
        <Card title="Create a token" hint="for apps and scripts that call the API">
          <TokenForm />
        </Card>
        <Card title="Using the API">
          <div className="stack small ink2">
            <p>Base URL <code className="mono">{base}</code>. Send <code className="mono">Authorization: Bearer &lt;token&gt;</code>.</p>
            <p>The <a href="/api/v1/openapi.json" target="_blank" rel="noreferrer">OpenAPI document</a> describes every endpoint and response, and can generate a typed client.</p>
            <p>Native apps sign in with <code className="mono">POST /auth/token</code> using your AthleteOS password; those tokens appear here too.</p>
          </div>
        </Card>
      </div>
      <Card title="Active tokens" className="flush">
        {tokens.length === 0 ? <Empty title="No tokens yet" /> : (
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>Name</th><th>Token</th><th>Created</th><th>Last used</th><th /></tr></thead>
              <tbody>
                {tokens.map((t) => (
                  <tr key={t.id}>
                    <td><b>{t.name}</b></td>
                    <td className="mono">{t.prefix}…</td>
                    <td>{day(t.created_at)}</td>
                    <td>{day(t.last_used_at)}</td>
                    <td className="num">
                      <form action={revokeApiToken}><input type="hidden" name="id" value={t.id} /><button className="btn sm danger" type="submit">Revoke {t.name}</button></form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
