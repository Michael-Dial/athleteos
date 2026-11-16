import type { Metadata } from "next";
import { getCtx } from "@/lib/domain/context";
import { countSubscriptions, vapidKeys } from "@/lib/push/webpush";
import { Card, Notice } from "@/components/ui";
import { PushToggle } from "@/components/push-toggle";
import { updateSettings } from "../../actions";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const sp = await searchParams;
  const ctx = await getCtx();
  const [{ publicKey }, subs] = await Promise.all([vapidKeys(), countSubscriptions(ctx.athlete.id)]);
  const r = ctx.settings.reminders;
  return (
    <div className="stack-lg">
      {sp.saved && <p className="small" style={{ color: "var(--good)" }} role="status">Reminder settings saved.</p>}
      {sp.error && <Notice kind="bad">{sp.error}</Notice>}
      <div className="grid cols-2">
        <Card title="This device" hint={`${subs} device${subs === 1 ? "" : "s"} subscribed`}>
          <PushToggle publicKey={publicKey} />
        </Card>
        <Card title="Morning check-in reminder">
          <form action={updateSettings} className="stack">
            <input type="hidden" name="$bools" value="reminders.morningEnabled" />
            <input type="hidden" name="back" value="/settings/notifications" />
            <label className="row" style={{ fontSize: 13 }}><input type="checkbox" name="reminders.morningEnabled" defaultChecked={r.morningEnabled} /> Remind me when a daily form is unanswered</label>
            <div className="form-grid">
              <label className="field">Time ({ctx.settings.timezone})<input type="time" name="reminders.morningTime" defaultValue={r.morningTime} required /></label>
              <label className="field">Still send up to (hours late)<input type="number" name="reminders.lateWindowHours" defaultValue={r.lateWindowHours} min={0.5} max={12} step={0.5} /><span className="help">covers a server restart at reminder time</span></label>
            </div>
            <div className="row"><button className="btn primary" type="submit">Save reminder</button></div>
          </form>
          <p className="small muted mt-sm">Sent once a day, only if a daily form is still due. Answering first means no notification.</p>
        </Card>
      </div>
    </div>
  );
}
