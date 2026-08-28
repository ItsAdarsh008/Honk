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
import { OUT_OF_BETA } from "./schools-out-of-beta";

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

  it("ends every school's steps with the actual keystrokes", () => {
    /*
     * "Select the whole page and copy it" is obvious to somebody who already
     * knows how and vague to everybody else, and a partial selection parses as
     * an empty schedule — which reads as Honk being broken rather than as a
     * mis-copy. The step is appended centrally so this cannot be forgotten at
     * a new school; this test is what says so.
     */
    for (const school of LIVE_SCHOOLS) {
      const last = school.guide!.steps[school.guide!.steps.length - 1];
      expect(last, `${school.id} does not name Ctrl+A`).toContain("Ctrl+A");
      expect(last, `${school.id} does not name Ctrl+C`).toContain("Ctrl+C");
      expect(last, `${school.id} does not name the Mac keys`).toContain("⌘");
    }
  });

  it("launched at the schools it says it has, in the order it shows them", () => {
    expect(LIVE_SCHOOLS.map((s) => s.id)).toEqual([
      "waterloo",
      "laurier",
      "toronto",
      "western",
      "mcmaster",
      "queens",
      "ubc",
      "york",
      "guelphhumber",
      "brock",
    ]);
  });

  it("has everything but Waterloo in beta", () => {
    // The switch is schools-out-of-beta.ts. If this fails, either a school
    // earned its way out or somebody edited that file without meaning to.
    const outOfBeta = SCHOOLS.filter((s) => !s.beta).map((s) => s.id);
    expect(outOfBeta).toEqual(["waterloo"]);
  });

  it("only lets a live school be out of beta", () => {
    // A waitlist school nobody can even sign in to must never read as proven.
    for (const school of WAITLIST_SCHOOLS) {
      expect(school.beta, `${school.id} is on the waitlist and not in beta`).toBe(true);
    }
  });

  it("names an id that exists for every entry in the beta switch", () => {
    // A typo in OUT_OF_BETA is silent: the tag simply does not disappear.
    for (const id of OUT_OF_BETA) {
      expect(getSchool(id), `${id} is in OUT_OF_BETA but is not a school`).not.toBeNull();
    }
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
    const parsed = parseSchoolAddress("jdoe@dal.ca");
    expect(parsed?.school.short).toBe("Dalhousie");
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
    expect(liveSchoolList()).toBe(
      "Waterloo, Laurier, Toronto, Western, McMaster, Queen's, UBC, York, Guelph-Humber and Brock",
    );
  });
});
