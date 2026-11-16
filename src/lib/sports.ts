// Plan sessions use coarse sport families; OW workouts carry a fine-grained
// normalized type. Matching plan vs actual happens at the family level so a
// planned "run" is fulfilled by trail_running or treadmill alike.
export const SPORT_FAMILIES = [
  "run", "ride", "swim", "strength", "row", "ski", "walk", "mobility", "team", "other",
] as const;
export type SportFamily = (typeof SPORT_FAMILIES)[number];

export const SPORT_LABEL: Record<SportFamily, string> = {
  run: "Run", ride: "Ride", swim: "Swim", strength: "Strength", row: "Row",
  ski: "Ski", walk: "Walk / hike", mobility: "Mobility", team: "Team / court", other: "Other",
};

const FAMILY_BY_TYPE: Record<string, SportFamily> = {
  running: "run", trail_running: "run", treadmill: "run",
  cycling: "ride", mountain_biking: "ride", indoor_cycling: "ride", cyclocross: "ride", e_biking: "ride",
  swimming: "swim", pool_swimming: "swim", open_water_swimming: "swim",
  strength_training: "strength", fitness_equipment: "strength", gymnastics: "strength",
  rowing: "row", rowing_machine: "row", kayaking: "row", canoeing: "row", paddling: "row",
  stand_up_paddleboarding: "row",
  cross_country_skiing: "ski", alpine_skiing: "ski", backcountry_skiing: "ski", downhill_skiing: "ski",
  snowboarding: "ski", snowshoeing: "ski",
  walking: "walk", hiking: "walk", trail_hiking: "walk", mountaineering: "walk", walking_fitness: "walk",
  casual_walking: "walk", stair_climbing: "walk",
  yoga: "mobility", pilates: "mobility", stretching: "mobility", meditation: "mobility", recovery: "mobility",
  soccer: "team", basketball: "team", football: "team", american_football: "team", baseball: "team",
  tennis: "team", badminton: "team", volleyball: "team", handball: "team", rugby: "team", hockey: "team",
  lacrosse: "team", squash: "team", padel: "team", pickleball: "team", racquetball: "team",
  team_sports: "team", racket_sports: "team",
};

export function familyOf(owType: string | null | undefined): SportFamily {
  if (!owType) return "other";
  return FAMILY_BY_TYPE[owType] ?? "other";
}

export function isSportFamily(v: string): v is SportFamily {
  return (SPORT_FAMILIES as readonly string[]).includes(v);
}

export function prettyType(t: string): string {
  return t.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
