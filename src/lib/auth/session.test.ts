import { describe, expect, it } from "vitest";
import { checkAddress, generateCode, hashCode, normalizeEmail, normalizeHandle } from "./session";

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

  it("rejects an address at no school Honk knows", () => {
    expect(normalizeEmail("jdoe@gmail.com")).toBeNull();
    expect(normalizeEmail("jdoe@laurier.ca")).toBeNull();
    expect(normalizeEmail("jdoe@dal.ca")).toBeNull();
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

  it("accepts every school Honk is live at, and folds subdomains", () => {
    expect(normalizeEmail("jdoe@yorku.ca")).toBe("jdoe@yorku.ca");
    expect(normalizeEmail("jdoe@my.yorku.ca")).toBe("jdoe@yorku.ca");
    expect(normalizeEmail("jdoe@mcmaster.ca")).toBe("jdoe@mcmaster.ca");
    expect(normalizeEmail("jdoe@brocku.ca")).toBe("jdoe@brocku.ca");
    expect(normalizeEmail("jdoe@guelphhumber.ca")).toBe("jdoe@guelphhumber.ca");
  });

  it("tells a school it has not launched at apart from one it does not know", () => {
    // The difference the sign-in screen turns into an invitation rather than
    // a red line under the box.
    const dal = checkAddress("jdoe@dal.ca");
    expect(dal.ok).toBe(false);
    expect(dal.ok === false && dal.reason).toBe("not_live");
    expect(dal.ok === false && dal.reason === "not_live" && dal.school.short).toBe("Dalhousie");

    const gmail = checkAddress("jdoe@gmail.com");
    expect(gmail.ok === false && gmail.reason).toBe("not_a_school");
  });

  it("refuses an address at a school that is only in the beta list", () => {
    expect(normalizeEmail("jdoe@dal.ca")).toBeNull();
    expect(normalizeEmail("jdoe@gmail.com")).toBeNull();
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
