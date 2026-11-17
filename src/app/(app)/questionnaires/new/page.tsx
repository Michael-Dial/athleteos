import Link from "next/link";
import type { Metadata } from "next";
import { DEF_DOC } from "@/lib/domain/questionnaire-doc";
import { Card } from "@/components/ui";
import { DefEditor } from "@/components/def-editor";
import { requireAdmin } from "@/lib/current-user";

export const metadata: Metadata = { title: "New questionnaire" };

const STARTER = JSON.stringify({
  slug: "post-session",
  name: "Post-session check",
  description: "Quick reflection after key sessions.",
  kind: "custom",
  schedule: "adhoc",
  items: [
    { key: "enjoyment", label: "Enjoyment", type: "scale", min: 1, max: 5, step: 1, lowLabel: "Not at all", highLabel: "Loved it", higherIsBetter: true, required: true },
    { key: "pain", label: "Any pain during the session?", type: "boolean" },
    { key: "notes", label: "Notes", type: "text" },
  ],
}, null, 2);

export default async function NewDefPage() {
  await requireAdmin();
  return (
    <div className="stack-lg">
      <div className="page-head">
        <div><h1>New questionnaire</h1><p className="sub">Paste an exported definition or edit the starter. Saving an existing slug updates that form.</p></div>
        <Link className="btn" href="/wellness">Back</Link>
      </div>
      <div className="grid cols-2">
        <Card title="Definition"><DefEditor initial={STARTER} /></Card>
        <Card title="Format"><pre className="mono" style={{ whiteSpace: "pre-wrap", margin: 0 }}>{DEF_DOC}</pre></Card>
      </div>
    </div>
  );
}
