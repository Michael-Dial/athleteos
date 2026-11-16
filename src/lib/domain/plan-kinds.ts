// Kept apart from plan.ts (which is server-only) so input schemas can import it anywhere.
export const PHASE_KINDS = ["base", "build", "peak", "taper", "race", "recovery", "transition"] as const;
export type PhaseKind = (typeof PHASE_KINDS)[number];
