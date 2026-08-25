import { describe, expect, it } from "vitest";
import { generateCode, hashCode, isWaterlooEmail, normalizeEmail, normalizeHandle } from "./session";

describe("normalizeEmail", () => {
  it("accepts a Waterloo address", () => {
    expect(normalizeEmail("jdoe@uwaterloo.ca")).toBe("jdoe@uwaterloo.ca");
  });

  it("lower-cases and trims", () => {
    expect(normalizeEmail("  JDoe@UWaterloo.CA ")).toBe("jdoe@uwaterloo.ca");
  });

  it("folds edu.uwaterloo.ca onto uwaterloo.ca so one person gets one account", () => {
    expect(normalizeEmail("jdoe@edu.uwaterloo.ca")).toBe("jdoe@uwaterloo.ca");
  });

  it("rejects everything that is not Waterloo", () => {
    expect(normalizeEmail("jdoe@gmail.com")).toBeNull();
    expect(normalizeEmail("jdoe@laurier.ca")).toBeNull();
    expect(normalizeEmail("jdoe@utoronto.ca")).toBeNull();
  });

  it("rejects a lookalike domain", () => {
    expect(normalizeEmail("jdoe@uwaterloo.ca.evil.com")).toBeNull();
    expect(normalizeEmail("jdoe@notuwaterloo.ca")).toBeNull();
    expect(normalizeEmail("jdoe@uwaterloo.com")).toBeNull();
  });

  it("rejects malformed addresses", () => {
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail("jdoe")).toBeNull();
    expect(normalizeEmail("a@b@uwaterloo.ca")).toBeNull();
    expect(normalizeEmail("jdoe @uwaterloo.ca")).toBeNull();
    expect(normalizeEmail(`${"a".repeat(300)}@uwaterloo.ca`)).toBeNull();
  });

  it("agrees with isWaterlooEmail", () => {
    expect(isWaterlooEmail("jdoe@uwaterloo.ca")).toBe(true);
    expect(isWaterlooEmail("jdoe@gmail.com")).toBe(false);
  });
});

describe("codes", () => {
  it("generates six digits, zero-padded", () => {
    for (let i = 0; i < 200; i += 1) {
      expect(generateCode()).toMatch(/^\d{6}$/);
    }
  });

  it("salts the hash with the email so a code is useless elsewhere", () => {
    expect(hashCode("a@uwaterloo.ca", "123456")).not.toBe(hashCode("b@uwaterloo.ca", "123456"));
  });

  it("hashes deterministically", () => {
    expect(hashCode("a@uwaterloo.ca", "123456")).toBe(hashCode("a@uwaterloo.ca", "123456"));
  });

  it("does not store the code in the hash", () => {
    expect(hashCode("a@uwaterloo.ca", "123456")).not.toContain("123456");
  });
});

describe("normalizeHandle", () => {
  it("accepts letters, numbers and underscores", () => {
    expect(normalizeHandle("jordan_1")).toBe("jordan_1");
  });

  it("strips a leading @ and lower-cases", () => {
    expect(normalizeHandle("@Jordan")).toBe("jordan");
  });

  it("rejects handles that are too short, too long, or have punctuation", () => {
    expect(normalizeHandle("j")).toBeNull();
    expect(normalizeHandle("j".repeat(21))).toBeNull();
    expect(normalizeHandle("jordan doe")).toBeNull();
    expect(normalizeHandle("jordan.doe")).toBeNull();
    expect(normalizeHandle("")).toBeNull();
  });
});
