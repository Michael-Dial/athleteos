import type { DefInput } from "./questionnaire-schema";

// Seeded on first run. The wellness form follows McLean et al. (2010): five
// 1-5 items where 5 is the favourable anchor.
export const DEFAULT_QUESTIONNAIRES: DefInput[] = [
  {
    slug: "morning-wellness",
    name: "Morning wellness",
    description: "Five-item wellness check (McLean et al., 2010). Answer on waking, before training.",
    kind: "wellness",
    schedule: "daily",
    items: [
      { key: "fatigue", label: "Fatigue", type: "scale", required: true, min: 1, max: 5, step: 1, lowLabel: "Always tired", highLabel: "Very fresh", higherIsBetter: true },
      { key: "sleep_quality", label: "Sleep quality", type: "scale", required: true, min: 1, max: 5, step: 1, lowLabel: "Insomnia", highLabel: "Very restful", higherIsBetter: true },
      { key: "soreness", label: "General muscle soreness", type: "scale", required: true, min: 1, max: 5, step: 1, lowLabel: "Very sore", highLabel: "Feeling great", higherIsBetter: true },
      { key: "stress", label: "Stress", type: "scale", required: true, min: 1, max: 5, step: 1, lowLabel: "Highly stressed", highLabel: "Very relaxed", higherIsBetter: true },
      { key: "mood", label: "Mood", type: "scale", required: true, min: 1, max: 5, step: 1, lowLabel: "Irritable / down", highLabel: "Very positive", higherIsBetter: true },
      { key: "illness", label: "Any illness symptoms?", type: "boolean", required: false },
      { key: "notes", label: "Notes", type: "text", required: false },
    ],
  },
  {
    slug: "weekly-check-in",
    name: "Weekly check-in",
    description: "End-of-week reflection on training and life load.",
    kind: "custom",
    schedule: "weekly",
    items: [
      { key: "motivation", label: "Motivation to train", type: "scale", required: true, min: 1, max: 10, step: 1, lowLabel: "None", highLabel: "Very high", higherIsBetter: true },
      { key: "life_stress", label: "Life stress outside training", type: "scale", required: true, min: 1, max: 10, step: 1, lowLabel: "Very low", highLabel: "Very high", higherIsBetter: false },
      { key: "body_mass", label: "Body mass", type: "number", required: false, min: 30, max: 250, step: 0.1, unit: "kg" },
      { key: "niggle", label: "Any niggle or injury?", type: "choice", required: false, options: ["None", "Minor, training as planned", "Modified training", "Unable to train"] },
      { key: "reflection", label: "What went well / what to change", type: "text", required: false },
    ],
  },
];
