import { z } from "zod";

// Questionnaire items are data, not code: any form is a list of these.
export const ItemSchema = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/, "lowercase letters, digits, underscore"),
    label: z.string().min(1).max(200),
    help: z.string().max(500).optional(),
    type: z.enum(["scale", "number", "boolean", "choice", "text"]),
    required: z.boolean().default(false),
    min: z.number().optional(),
    max: z.number().optional(),
    step: z.number().positive().optional(),
    lowLabel: z.string().max(80).optional(),
    highLabel: z.string().max(80).optional(),
    // Direction is explicit per item so mixed-direction forms average correctly.
    higherIsBetter: z.boolean().optional(),
    unit: z.string().max(20).optional(),
    options: z.array(z.string().min(1).max(80)).max(20).optional(),
    // Include in the daily wellness composite (scale/number items only).
    wellness: z.boolean().optional(),
  })
  .superRefine((it, ctx) => {
    if (it.type === "scale") {
      if (it.min == null || it.max == null || it.max <= it.min) {
        ctx.addIssue({ code: "custom", message: `${it.key}: scale needs min < max` });
      }
    }
    if (it.type === "choice" && !(it.options && it.options.length >= 2)) {
      ctx.addIssue({ code: "custom", message: `${it.key}: choice needs at least two options` });
    }
  });

export type Item = z.infer<typeof ItemSchema>;

export const ItemsSchema = z
  .array(ItemSchema)
  .min(1)
  .max(50)
  .superRefine((items, ctx) => {
    const seen = new Set<string>();
    for (const it of items) {
      if (seen.has(it.key)) ctx.addIssue({ code: "custom", message: `duplicate key ${it.key}` });
      seen.add(it.key);
    }
  });

export const DefSchema = z.object({
  slug: z.string().regex(/^[a-z][a-z0-9-]{1,39}$/),
  name: z.string().min(1).max(120),
  description: z.string().max(1000).nullable().optional(),
  kind: z.enum(["wellness", "custom"]),
  schedule: z.enum(["daily", "weekly", "adhoc"]),
  items: ItemsSchema,
});
export type DefInput = z.infer<typeof DefSchema>;

export type Answer = number | boolean | string | null;

/** Validate one submission against the items it answers. Returns cleaned answers or errors by key. */
export function validateAnswers(items: Item[], raw: Record<string, unknown>): { answers: Record<string, Answer>; errors: Record<string, string> } {
  const answers: Record<string, Answer> = {};
  const errors: Record<string, string> = {};
  for (const it of items) {
    const v = raw[it.key];
    const empty = v === undefined || v === null || v === "";
    if (empty) {
      if (it.required && it.type !== "boolean") errors[it.key] = "Answer this to submit";
      answers[it.key] = it.type === "boolean" ? false : null;
      continue;
    }
    switch (it.type) {
      case "scale":
      case "number": {
        const n = typeof v === "number" ? v : Number(v);
        if (!Number.isFinite(n)) { errors[it.key] = "Enter a number"; break; }
        if (it.min != null && n < it.min) { errors[it.key] = `Minimum is ${it.min}`; break; }
        if (it.max != null && n > it.max) { errors[it.key] = `Maximum is ${it.max}`; break; }
        answers[it.key] = n;
        break;
      }
      case "boolean":
        answers[it.key] = v === true || v === "true" || v === "on" || v === "1";
        break;
      case "choice":
        if (!it.options?.includes(String(v))) errors[it.key] = "Pick one of the options";
        else answers[it.key] = String(v);
        break;
      case "text":
        answers[it.key] = String(v).slice(0, 4000);
        break;
    }
  }
  return { answers, errors };
}

/**
 * Per-item wellness scores rescaled to 0..1 with 1 = favourable, and their mean
 * x 100 as the composite. Rescaling lets items with different anchors share one
 * composite; direction comes from `higherIsBetter`.
 */
export function wellnessScores(items: Item[], answers: Record<string, Answer>): { itemScores: Record<string, number>; composite: number | null } {
  const itemScores: Record<string, number> = {};
  for (const it of items) {
    const include = it.wellness ?? it.type === "scale";
    if (!include || (it.type !== "scale" && it.type !== "number")) continue;
    if (it.min == null || it.max == null || it.max <= it.min) continue;
    const v = answers[it.key];
    if (typeof v !== "number") continue;
    let s = (v - it.min) / (it.max - it.min);
    if (it.higherIsBetter === false) s = 1 - s;
    itemScores[it.key] = Math.min(1, Math.max(0, s));
  }
  const vals = Object.values(itemScores);
  return { itemScores, composite: vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length) * 100 : null };
}
