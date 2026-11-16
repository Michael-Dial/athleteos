import { describe, expect, it } from "vitest";
import { DefSchema, validateAnswers, wellnessScores } from "./questionnaire-schema";
import { DEFAULT_QUESTIONNAIRES } from "./questionnaire-templates";

describe("questionnaire engine", () => {
  it("default templates validate", () => {
    for (const q of DEFAULT_QUESTIONNAIRES) expect(DefSchema.safeParse(q).success).toBe(true);
  });
  it("validates answers and reports missing required items", () => {
    const items = DEFAULT_QUESTIONNAIRES[0].items;
    const r = validateAnswers(items, { fatigue: "3", sleep_quality: 6 });
    expect(r.answers.fatigue).toBe(3);
    expect(r.errors.sleep_quality).toMatch(/Maximum/);
    expect(r.errors.soreness).toBeDefined();
    expect(r.answers.illness).toBe(false);
  });
  it("scores wellness with direction and rescaling", () => {
    const items = DEFAULT_QUESTIONNAIRES[1].items;
    const { itemScores, composite } = wellnessScores(items, { motivation: 10, life_stress: 10 });
    expect(itemScores.motivation).toBe(1);
    expect(itemScores.life_stress).toBe(0);
    expect(composite).toBe(50);
    expect(itemScores.body_mass).toBeUndefined();
  });
});
