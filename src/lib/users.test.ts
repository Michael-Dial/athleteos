import { describe, expect, it } from "vitest";
import { formatCode, normalizeCode } from "./users";

describe("invite codes", () => {
  it("accept what people actually type", () => {
    expect(normalizeCode("k7qm-2xra-9tpd")).toBe("K7QM2XRA9TPD");
    expect(normalizeCode(" K7QM 2XRA 9TPD ")).toBe("K7QM2XRA9TPD");
    // Look-alikes read as the digits the alphabet uses instead.
    expect(normalizeCode("KOQM-2XRA-9TPI")).toBe("K0QM2XRA9TP1");
  });
  it("reject anything that isn't a code", () => {
    for (const bad of ["", "K7QM-2XRA", "K7QM-2XRA-9TPD-0000", "K7QU-2XRA-9TPD", "../../etc"]) expect(normalizeCode(bad)).toBeNull();
  });
  it("formats in groups of four", () => {
    expect(formatCode("K7QM2XRA9TPD")).toBe("K7QM-2XRA-9TPD");
  });
});
