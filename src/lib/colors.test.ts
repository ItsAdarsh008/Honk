import { describe, expect, it } from "vitest";
import { COURSE_COLOR_COUNT, assignCourseColors, colorSeedFor } from "./colors";

describe("assignCourseColors", () => {
  it("gives every course in a normal schedule a different colour", () => {
    // The real schedule that caught this: MATH 135 and PSYCH 101 hashed to the
    // same pastel, which made the grid harder to read.
    const colors = assignCourseColors([
      "CS 135",
      "MATH 135",
      "BUS 111W",
      "PSYCH 101",
      "ENGL 109",
    ]);
    const used = Object.values(colors);
    expect(new Set(used).size).toBe(used.length);
  });

  it("never collides for any schedule of six or fewer courses", () => {
    const subjects = ["CS", "MATH", "BUS", "PSYCH", "ENGL", "ECON", "STAT", "PHYS", "AFM", "SPCOM"];
    const catalogs = ["101", "111W", "135", "136", "137", "230", "121", "109", "100", "215"];

    // Every 6-course combination drawn from a realistic pool.
    for (let i = 0; i < 400; i += 1) {
      const keys: string[] = [];
      for (let k = 0; k < 6; k += 1) {
        const s = subjects[(i * 7 + k * 3) % subjects.length];
        const c = catalogs[(i * 5 + k * 11) % catalogs.length];
        const key = `${s} ${c}`;
        if (!keys.includes(key)) keys.push(key);
      }
      const colors = assignCourseColors(keys);
      const used = Object.values(colors);
      expect(new Set(used).size, `collision for ${keys.join(", ")}`).toBe(keys.length);
    }
  });

  it("stays inside the palette", () => {
    const colors = assignCourseColors(["CS 135", "MATH 135", "BUS 111W"]);
    for (const value of Object.values(colors)) {
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(COURSE_COLOR_COUNT);
    }
  });

  it("is deterministic for the same set of courses in any order", () => {
    const a = assignCourseColors(["CS 135", "MATH 135", "BUS 111W"]);
    const b = assignCourseColors(["BUS 111W", "CS 135", "MATH 135"]);
    expect(a).toEqual(b);
  });

  it("keeps a course on its hashed colour when nothing contends for it", () => {
    const colors = assignCourseColors(["CS 135"]);
    expect(colors["CS 135"]).toBe(colorSeedFor("CS", "135") + 1);
  });

  it("handles more courses than colours without crashing", () => {
    const keys = ["CS 135", "MATH 135", "BUS 111W", "PSYCH 101", "ENGL 109", "ECON 101", "STAT 230"];
    const colors = assignCourseColors(keys);
    expect(Object.keys(colors)).toHaveLength(keys.length);
    for (const value of Object.values(colors)) {
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(COURSE_COLOR_COUNT);
    }
  });

  it("ignores duplicates", () => {
    const colors = assignCourseColors(["CS 135", "CS 135", "MATH 135"]);
    expect(Object.keys(colors)).toEqual(["CS 135", "MATH 135"]);
  });

  it("returns nothing for no courses", () => {
    expect(assignCourseColors([])).toEqual({});
  });
});
