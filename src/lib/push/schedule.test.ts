import { describe, expect, it } from "vitest";
import { localHHMM, shouldSendMorning } from "./schedule";

const base = { enabled: true, nowHHMM: "07:30", time: "07:30", lateWindowHours: 3, dueForms: 1, alreadySent: false };

describe("morning reminder decision", () => {
  it("sends at the set time when a form is due", () => expect(shouldSendMorning(base)).toBe(true));
  it("not before the set time", () => expect(shouldSendMorning({ ...base, nowHHMM: "07:29" })).toBe(false));
  it("still sends late within the window (e.g. after a restart)", () => expect(shouldSendMorning({ ...base, nowHHMM: "10:29" })).toBe(true));
  it("not after the late window", () => expect(shouldSendMorning({ ...base, nowHHMM: "10:30" })).toBe(false));
  it("not twice, not when nothing is due, not when disabled", () => {
    expect(shouldSendMorning({ ...base, alreadySent: true })).toBe(false);
    expect(shouldSendMorning({ ...base, dueForms: 0 })).toBe(false);
    expect(shouldSendMorning({ ...base, enabled: false })).toBe(false);
  });
  it("reads local time in the athlete's timezone", () => {
    expect(localHHMM(new Date("2026-07-01T11:30:00Z"), "America/New_York")).toBe("07:30");
    expect(localHHMM(new Date("2026-12-01T12:30:00Z"), "America/New_York")).toBe("07:30");
  });
});
