import { describe, expect, it } from "vitest";
import { addDays, endOfMonth, localDateWithOffset, startOfWeek, utcToZonedWall, zonedToUtc } from "./dates";

describe("dates", () => {
  it("calendar arithmetic is DST-safe", () => {
    expect(addDays("2026-03-07", 1)).toBe("2026-03-08");
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
    expect(startOfWeek("2026-11-16")).toBe("2026-11-16");
    expect(startOfWeek("2026-11-22")).toBe("2026-11-16");
    expect(endOfMonth("2026-02-10")).toBe("2026-02-28");
  });
  it("local date from record offset", () => {
    expect(localDateWithOffset("2026-11-15T03:00:00Z", "-05:00", "UTC")).toBe("2026-11-14");
  });
  it("zoned wall time round-trips across DST", () => {
    const t = zonedToUtc("2026-07-01T08:30", "America/New_York");
    expect(t.toISOString()).toBe("2026-07-01T12:30:00.000Z");
    expect(zonedToUtc("2026-12-01T08:30", "America/New_York").toISOString()).toBe("2026-12-01T13:30:00.000Z");
    expect(utcToZonedWall(t, "America/New_York")).toBe("2026-07-01T08:30");
  });
});
