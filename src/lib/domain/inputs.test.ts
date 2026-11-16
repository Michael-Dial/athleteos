import { describe, expect, it } from "vitest";
import { AnnotationInput, ManualSessionInput, PhaseInput, PlanSessionInput } from "./inputs";

describe("shared write inputs", () => {
  it("annotation: absent text fields stay undefined (keep stored), empty strings clear", () => {
    const tap = AnnotationInput.parse({ owWorkoutId: "w1", date: "2026-11-16", rpe: 6 });
    expect(tap.title).toBeUndefined();
    expect(tap.notes).toBeUndefined();
    expect(tap.excluded).toBeUndefined();
    const clear = AnnotationInput.parse({ owWorkoutId: "w1", date: "2026-11-16", notes: "" });
    expect(clear.notes).toBeNull();
  });
  it("rejects RPE outside CR-10 and bad dates", () => {
    expect(AnnotationInput.safeParse({ owWorkoutId: "w", date: "2026-11-16", rpe: 11 }).success).toBe(false);
    expect(ManualSessionInput.safeParse({ date: "16/11/2026", sport: "run", durationMin: 30 }).success).toBe(false);
  });
  it("manual sessions need a positive duration and a known sport", () => {
    expect(ManualSessionInput.safeParse({ date: "2026-11-16", sport: "run", durationMin: 0 }).success).toBe(false);
    expect(ManualSessionInput.safeParse({ date: "2026-11-16", sport: "curling", durationMin: 30 }).success).toBe(false);
    expect(ManualSessionInput.parse({ date: "2026-11-16", sport: "strength", durationMin: 45, rpe: 6 }).rpe).toBe(6);
  });
  it("plan sessions need a title; phases need end >= start", () => {
    expect(PlanSessionInput.safeParse({ date: "2026-11-16", sport: "run", title: "  " }).success).toBe(false);
    const bad = PhaseInput.safeParse({ name: "Build", kind: "build", startDate: "2026-12-01", endDate: "2026-11-01" });
    expect(bad.success).toBe(false);
    expect(bad.error!.issues[0].path).toEqual(["endDate"]);
  });
});
