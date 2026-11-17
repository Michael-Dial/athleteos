import Link from "next/link";
import type { AppCtx } from "@/lib/domain/context";
import { Notice } from "./ui";

export function SetupBanner({ ctx }: { ctx: AppCtx }) {
  if (!ctx.owConfigured) {
    return (
      <Notice>
        Open Wearables isn&apos;t connected, so device data is hidden. <Link href="/settings/credentials">Add its URL and API key</Link>.
        Plan, history and questionnaires work without it.
      </Notice>
    );
  }
  if (!ctx.athlete.ow_user_id) {
    return (
      <Notice>
        Link this athlete to an Open Wearables user to see device data. <Link href="/settings/connections">Link a user</Link>
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
