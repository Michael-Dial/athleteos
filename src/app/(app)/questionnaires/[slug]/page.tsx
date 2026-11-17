import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCtx } from "@/lib/domain/context";
import { requireAdmin } from "@/lib/current-user";
import { getDef } from "@/lib/domain/questionnaires";
import { DEF_DOC } from "@/lib/domain/questionnaire-doc";
import { Card } from "@/components/ui";
import { DefEditor } from "@/components/def-editor";

export const metadata: Metadata = { title: "Edit questionnaire" };

export default async function EditDefPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await requireAdmin();
  const ctx = await getCtx();
  const def = await getDef(ctx.athlete.id, slug);
  if (!def) notFound();
  const json = JSON.stringify({ slug: def.slug, name: def.name, description: def.description, kind: def.kind, schedule: def.schedule, items: def.items }, null, 2);
  return (
    <div className="stack-lg">
      <div className="page-head">
        <div><h1>Edit {def.name}</h1><p className="sub">Version {def.version}. Changing items creates version {def.version + 1}; existing answers keep their original items.</p></div>
        <div className="row">
          <a className="btn" href={`/api/questionnaires/${slug}`} download={`${slug}.json`}>Export JSON</a>
          <Link className="btn" href="/wellness">Back</Link>
        </div>
      </div>
      <div className="grid cols-2">
        <Card title="Definition"><DefEditor initial={json} /></Card>
        <Card title="Format"><pre className="mono" style={{ whiteSpace: "pre-wrap", margin: 0 }}>{DEF_DOC}</pre></Card>
      </div>
    </div>
  );
}
