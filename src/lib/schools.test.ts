/**
 * The school registry.
 *
 * Most of this is guarding against the ways a hand-maintained list goes wrong:
 * a duplicate id silently shadowing a school, a domain that swallows another
 * school's addresses, a live school with no instructions. All of them would
 * ship without a type error and would only be noticed by the student they
 * happened to.
 */

import { describe, expect, it } from "vitest";
import {
  LIVE_SCHOOLS,
  SCHOOLS,
  WAITLIST_SCHOOLS,
  getSchool,
  isLive,
  liveSchoolList,
  parseSchoolAddress,
  schoolForDomain,
  schoolOrDefault,
  waitlistByProvince,
} from "./schools";

describe("the registry", () => {
  it("has no duplicate ids", () => {
    const ids = SCHOOLS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has no duplicate domains", () => {
    const domains = SCHOOLS.flatMap((s) => s.domains);
    expect(new Set(domains).size).toBe(domains.length);
  });

  it("has no domain that is a subdomain of another school's", () => {
    // `mail.x.ca` under school A and `x.ca` under school B would send A's
    // students to B, since matching walks up to the root.
    for (const school of SCHOOLS) {
      for (const domain of school.domains) {
        const owner = schoolForDomain(domain);
        expect(owner?.id, `${domain} resolves to the wrong school`).toBe(school.id);
      }
    }
  });

  it("gives every live school a portal and steps to follow", () => {
    for (const school of LIVE_SCHOOLS) {
      expect(school.guide?.portal, `${school.id} has no portal name`).toBeTruthy();
      expect(school.guide?.steps.length, `${school.id} has no steps`).toBeGreaterThan(0);
    }
  });

  it("launched at the five schools it says it has", () => {
    expect(LIVE_SCHOOLS.map((s) => s.id)).toEqual([
      "waterloo",
      "york",
      "guelphhumber",
      "mcmaster",
      "brock",
    ]);
  });

  it("keeps every waitlist school out of the live list, and in a province", () => {
    expect(WAITLIST_SCHOOLS.every((s) => s.status === "waitlist")).toBe(true);
    const grouped = waitlistByProvince().flatMap((g) => g.schools);
    expect(grouped.length).toBe(WAITLIST_SCHOOLS.length);
  });

  it("gives every school a real IANA time zone", () => {
    for (const school of SCHOOLS) {
      expect(() =>
        new Intl.DateTimeFormat("en-CA", { timeZone: school.timezone }),
      ).not.toThrow();
    }
  });
});

describe("addresses", () => {
  it("reads an address at a live school and folds it onto the canonical domain", () => {
    expect(parseSchoolAddress("JDoe@uwaterloo.ca")?.email).toBe("jdoe@uwaterloo.ca");
    expect(parseSchoolAddress("jdoe@edu.uwaterloo.ca")?.email).toBe("jdoe@uwaterloo.ca");
    expect(parseSchoolAddress("jdoe@my.yorku.ca")?.email).toBe("jdoe@yorku.ca");
    expect(parseSchoolAddress("  jdoe@brocku.ca  ")?.email).toBe("jdoe@brocku.ca");
  });

  it("names the school for an address Honk knows and has not launched at", () => {
    const parsed = parseSchoolAddress("jdoe@queensu.ca");
    expect(parsed?.school.short).toBe("Queen's");
    expect(parsed?.school.status).toBe("waitlist");
  });

  it("does not confuse Guelph-Humber with Guelph", () => {
    expect(parseSchoolAddress("a@guelphhumber.ca")?.school.id).toBe("guelphhumber");
    expect(parseSchoolAddress("a@uoguelph.ca")?.school.id).toBe("guelph");
    expect(isLive("guelphhumber")).toBe(true);
    expect(isLive("guelph")).toBe(false);
  });

  it("refuses anything that is not a university address", () => {
    expect(parseSchoolAddress("jdoe@gmail.com")).toBeNull();
    expect(parseSchoolAddress("jdoe")).toBeNull();
    expect(parseSchoolAddress("a@b@uwaterloo.ca")).toBeNull();
    expect(parseSchoolAddress("jdoe @uwaterloo.ca")).toBeNull();
    expect(parseSchoolAddress(`${"a".repeat(300)}@uwaterloo.ca`)).toBeNull();
  });

  it("is not fooled by a lookalike domain", () => {
    // `uwaterloo.ca.example.com` ends in nothing Honk owns.
    expect(parseSchoolAddress("jdoe@uwaterloo.ca.example.com")).toBeNull();
    expect(parseSchoolAddress("jdoe@notuwaterloo.ca")).toBeNull();
  });
});

describe("lookups", () => {
  it("falls back to Waterloo for an unknown or missing id", () => {
    expect(schoolOrDefault(null).id).toBe("waterloo");
    expect(schoolOrDefault("atlantis").id).toBe("waterloo");
    expect(getSchool("atlantis")).toBeNull();
  });

  it("writes the live list as a sentence", () => {
    expect(liveSchoolList()).toBe("Waterloo, York, Guelph-Humber, McMaster and Brock");
  });
});
