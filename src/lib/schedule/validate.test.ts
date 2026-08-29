/**
 * The validator guards rows that are *shared between users*, so a bad payload
 * would not just corrupt one account. These tests are the fence around that.
 */

import { describe, expect, it } from "vitest";
import { parseQuestSchedule } from "../quest/parse";
import { validateSchedule } from "./validate";

const GOOD = {
  termCode: "1269",
  courses: [
    {
      subject: "CS",
      catalog: "135",
      title: "Designing Functional Programs",
      status: "enrolled",
      sections: [
        {
          classNumber: 4280,
          sectionCode: "001",
          component: "LEC",
          instructor: "J Smith",
          startDate: "2026-09-08",
          endDate: "2026-12-02",
          meetings: [{ weekday: 1, startMin: 630, endMin: 680, location: "MC 4020" }],
        },
      ],
    },
  ],
};

const clone = () => JSON.parse(JSON.stringify(GOOD));

describe("validateSchedule", () => {
  it("accepts a well-formed schedule", () => {
    const result = validateSchedule(GOOD);
    expect(result.ok).toBe(true);
  });

  it("accepts whatever the parser actually produces", () => {
    const parsed = parseQuestSchedule(
      [
        "CS 135 - Designing Functional Programs",
        "4280\t001\tLEC\tMWF 10:30AM-11:20AM\tMC 4020\tJ Smith\t09/08/2026 - 12/02/2026",
        "4281\t101\tTUT\tTh 2:30PM-3:20PM\tMC 4021\tTBA\t09/08/2026 - 12/02/2026",
      ].join("\n"),
    );
    const result = validateSchedule({ courses: parsed.courses, termCode: parsed.termCode });
    expect(result.ok).toBe(true);
  });

  it("rejects a missing or malformed term", () => {
    expect(validateSchedule({ ...clone(), termCode: "" }).ok).toBe(false);
    expect(validateSchedule({ ...clone(), termCode: "fall" }).ok).toBe(false);
    expect(validateSchedule({ ...clone(), termCode: "12690" }).ok).toBe(false);
  });

  it("rejects an empty schedule", () => {
    expect(validateSchedule({ termCode: "1269", courses: [] }).ok).toBe(false);
    expect(validateSchedule(null).ok).toBe(false);
    expect(validateSchedule("nope").ok).toBe(false);
  });

  it("rejects a course code that is not a course code", () => {
    const bad = clone();
    bad.courses[0].subject = "<script>";
    expect(validateSchedule(bad).ok).toBe(false);
  });

  it("rejects a catalog number that is not a catalog number", () => {
    const bad = clone();
    bad.courses[0].catalog = "135; drop table";
    expect(validateSchedule(bad).ok).toBe(false);
  });

  it("rejects a class number out of range", () => {
    const bad = clone();
    bad.courses[0].sections[0].classNumber = 999999;
    expect(validateSchedule(bad).ok).toBe(false);
  });

  it("rejects a non-integer class number", () => {
    const bad = clone();
    bad.courses[0].sections[0].classNumber = 4280.5;
    expect(validateSchedule(bad).ok).toBe(false);
  });

  it("drops the same class listed twice rather than refusing the schedule", () => {
    /*
     * This used to be a rejection. It cost a real student at York a whole
     * term: two required components of one course that the parser could not
     * tell apart, and the entire paste refused with a message describing
     * something that was not true of his timetable. An exact repeat is now
     * dropped, and the rest of the schedule saves.
     */
    const doubled = clone();
    const before = doubled.courses[0].sections.length;
    doubled.courses[0].sections.push({ ...doubled.courses[0].sections[0] });

    const result = validateSchedule(doubled);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.courses[0].sections).toHaveLength(before);
  });

  it("keeps two components that collide but meet at different times", () => {
    // The York case: same course, same section code, different parts. They are
    // different classes and both have to survive.
    const twoParts = clone();
    const first = twoParts.courses[0].sections[0];
    twoParts.courses[0].sections = [
      { ...first, classNumber: null, meetings: [{ weekday: 1, startMin: 600, endMin: 650, location: null }] },
      { ...first, classNumber: null, meetings: [{ weekday: 3, startMin: 800, endMin: 850, location: null }] },
    ];

    const result = validateSchedule(twoParts);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.courses[0].sections).toHaveLength(2);
  });

  it("rejects a meeting that ends before it starts", () => {
    const bad = clone();
    bad.courses[0].sections[0].meetings[0] = {
      weekday: 1,
      startMin: 680,
      endMin: 630,
      location: null,
    };
    expect(validateSchedule(bad).ok).toBe(false);
  });

  it("rejects an impossible weekday", () => {
    const bad = clone();
    bad.courses[0].sections[0].meetings[0].weekday = 9;
    expect(validateSchedule(bad).ok).toBe(false);
  });

  it("rejects a minute outside the day", () => {
    const bad = clone();
    bad.courses[0].sections[0].meetings[0].endMin = 5000;
    expect(validateSchedule(bad).ok).toBe(false);
  });

  it("caps how much one payload can write", () => {
    const bad = clone();
    bad.courses = Array.from({ length: 40 }, (_, i) => ({
      ...clone().courses[0],
      catalog: String(100 + i),
      sections: [{ ...clone().courses[0].sections[0], classNumber: 5000 + i }],
    }));
    expect(validateSchedule(bad).ok).toBe(false);
  });

  it("caps an over-long room and instructor rather than storing them", () => {
    const bad = clone();
    bad.courses[0].sections[0].meetings[0].location = "x".repeat(200);
    expect(validateSchedule(bad).ok).toBe(false);
  });

  it("normalises case on codes so shared rows do not fork", () => {
    const mixed = clone();
    mixed.courses[0].subject = "cs";
    mixed.courses[0].catalog = "135";
    mixed.courses[0].sections[0].component = "lec";
    const result = validateSchedule(mixed);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.courses[0].subject).toBe("CS");
      expect(result.value.courses[0].sections[0].component).toBe("LEC");
    }
  });

  it("keeps a section with no meetings, since online courses have none", () => {
    const online = clone();
    online.courses[0].sections[0].meetings = [];
    expect(validateSchedule(online).ok).toBe(true);
  });

  it("drops a status the client claimed and stores it as enrolled", () => {
    const sneaky = clone();
    sneaky.courses[0].status = "dropped";
    const result = validateSchedule(sneaky);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.courses[0].status).toBe("enrolled");
  });
});
