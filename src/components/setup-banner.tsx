import Link from "next/link";
import type { AppCtx } from "@/lib/domain/context";
import { Notice } from "./ui";

export function SetupBanner({ ctx }: { ctx: AppCtx }) {
  if (!ctx.owConfigured) {
    return (
      <Notice>
        Device data isn&apos;t set up on this server yet, so it&apos;s hidden. <Link href="/settings/credentials">Finish setup</Link>.
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
