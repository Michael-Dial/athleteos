import Link from "next/link";
import type { AppCtx } from "@/lib/domain/context";
import { actsAsAdmin } from "@/lib/current-user";
import { Notice } from "./ui";

export async function SetupBanner({ ctx }: { ctx: AppCtx }) {
  if (!ctx.owConfigured) {
    const admin = await actsAsAdmin();
    return (
      <Notice>
        Device data isn&apos;t set up on this server yet, so it&apos;s hidden.{" "}
        {admin ? <><Link href="/settings/credentials">Finish setup</Link>.</> : "Your admin needs to finish setting it up."}{" "}
        Plan, history and questionnaires work without it.
      </Notice>
    );
  }
  if (!ctx.athlete.ow_user_id) {
    return (
      <Notice>
        Connect a wearable or Apple Health to see device data here. <Link href="/settings/accounts">Connect an account</Link>
      </Notice>
    );
  }
  return null;
}

export function OwErrors({ errors }: { errors: (string | null | undefined)[] }) {
  const uniq = [...new Set(errors.filter((e): e is string => !!e))];
  if (!uniq.length) return null;
  return <div className="stack">{uniq.map((e) => <Notice key={e} kind="bad">{e}</Notice>)}</div>;
}
