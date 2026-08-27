/**
 * The tolerant parser, against the shapes the four non-PeopleSoft portals
 * produce.
 *
 * An honest note about what these fixtures are. The Quest tests next door are
 * built from a real paste. These are built from each portal's own
 * documentation and the layouts their exporters assume, because Honk has not
 * had a York, Brock or Guelph-Humber student paste into it yet — that is
 * exactly what the beta page is asking for.
 *
 * So they prove tolerance rather than fidelity: several plausible shapes per
 * school, and the parser reads all of them. When a real paste arrives, it goes
 * in here beside these and whatever it breaks gets fixed.
 */

import { describe, expect, it } from "vitest";
import { parseDayList, parseGenericSchedule, parseTimeRange, detectDateOrder } from "./generic";

const TODAY = "2026-09-14";

function meetingsOf(result: ReturnType<typeof parseGenericSchedule>) {
  return result.courses.flatMap((c) =>
    c.sections.flatMap((s) =>
      s.meetings.map((m) => ({
        code: `${c.subject} ${c.catalog}`,
        component: s.component,
        section: s.sectionCode,
        weekday: m.weekday,
        start: m.startMin,
        end: m.endMin,
        room: m.location,
      })),
    ),
  );
}

describe("parseDayList", () => {
  it("reads run-on letters", () => {
    expect(parseDayList("MWF")).toEqual([1, 3, 5]);
    expect(parseDayList("TTh")).toEqual([2, 4]);
    expect(parseDayList("MThF")).toEqual([1, 4, 5]);
  });

  it("reads the single-letter forms York and Guelph use", () => {
    expect(parseDayList("TR")).toEqual([2, 4]);
    expect(parseDayList("MTWRF")).toEqual([1, 2, 3, 4, 5]);
    expect(parseDayList("U")).toEqual([7]);
  });

  it("reads separated and spelled-out days", () => {
    expect(parseDayList("M, W, F")).toEqual([1, 3, 5]);
    expect(parseDayList("Mon Wed Fri")).toEqual([1, 3, 5]);
    expect(parseDayList("Tuesday and Thursday")).toEqual([2, 4]);
    expect(parseDayList("Tues/Thurs")).toEqual([2, 4]);
  });

  it("refuses anything it cannot consume whole", () => {
    expect(parseDayList("TBA")).toBeNull();
    expect(parseDayList("Fall")).toBeNull();
    expect(parseDayList("Online")).toBeNull();
    expect(parseDayList("")).toBeNull();
  });
});

describe("parseTimeRange", () => {
  it("reads 12-hour and 24-hour clocks", () => {
    expect(parseTimeRange("10:30AM", "11:20AM")).toEqual({ startMin: 630, endMin: 680 });
    expect(parseTimeRange("11:30", "13:20")).toEqual({ startMin: 690, endMin: 800 });
    expect(parseTimeRange("2:00 p.m.", "3:30 p.m.")).toEqual({ startMin: 840, endMin: 930 });
  });

  it("infers the meridiem the portal left off one side", () => {
    expect(parseTimeRange("10:30", "11:20 AM")).toEqual({ startMin: 630, endMin: 680 });
    expect(parseTimeRange("2:30 PM", "3:20")).toEqual({ startMin: 870, endMin: 920 });
  });

  it("rolls a backwards bare range into the afternoon", () => {
    // 11:30 to 1:20 can only mean 13:20; nothing runs backwards.
    expect(parseTimeRange("11:30", "1:20")).toEqual({ startMin: 690, endMin: 800 });
  });

  it("refuses a range with neither minutes nor a meridiem", () => {
    // `9 - 10` is as likely to be a seat count as a class time.
    expect(parseTimeRange("9", "10")).toBeNull();
  });
});

describe("date order", () => {
  it("takes the reading a day over twelve forces", () => {
    expect(detectDateOrder("9/8/2026 to 12/4/2026")).toBe("monthFirst");
    expect(detectDateOrder("08/09/2026 - 04/12/2026")).toBe("monthFirst");
    expect(detectDateOrder("14/09/2026 - 04/12/2026")).toBe("dayFirst");
  });
});

/* ------------------------------------------------------------------ *
 * York — REM / Plot My Timetable
 * ------------------------------------------------------------------ */

const YORK = [
  "Fall/Winter 2026-2027",
  "AP/ECON 1000 3.00\tSection A\tIntroduction to Microeconomics",
  "LECT 01\tMon\t11:30 - 13:20\tACE 009\tJ Smith",
  "LECT 01\tWed\t11:30 - 12:20\tACE 009\tJ Smith",
  "TUTR 02\tThu\t14:30 - 15:20\tVH 3009\tTBA",
  "SC/MATH 1013 3.00\tSection B\tApplied Calculus I",
  "LECT 01\tTR\t09:30 - 11:20\tCLH 110\tA Patel",
].join("\n");

describe("York", () => {
  const result = parseGenericSchedule(YORK, { today: TODAY });

  it("keeps the faculty prefix as part of the subject", () => {
    expect(result.courses.map((c) => `${c.subject} ${c.catalog}`)).toEqual([
      "AP/ECON 1000",
      "SC/MATH 1013",
    ]);
  });

  it("reads the title and drops the credit weight", () => {
    expect(result.courses[0].title).toBe("Introduction to Microeconomics");
  });

  it("splits lecture and tutorial into their own sections", () => {
    const econ = result.courses[0];
    expect(econ.sections.map((s) => `${s.component} ${s.sectionCode}`)).toEqual([
      "LEC 01",
      "TUT 02",
    ]);
  });

  it("reads 24-hour times, days and rooms", () => {
    expect(meetingsOf(result)).toEqual([
      { code: "AP/ECON 1000", component: "LEC", section: "01", weekday: 1, start: 690, end: 800, room: "ACE 009" },
      { code: "AP/ECON 1000", component: "LEC", section: "01", weekday: 3, start: 690, end: 740, room: "ACE 009" },
      { code: "AP/ECON 1000", component: "TUT", section: "02", weekday: 4, start: 870, end: 920, room: "VH 3009" },
      { code: "SC/MATH 1013", component: "LEC", section: "01", weekday: 2, start: 570, end: 680, room: "CLH 110" },
      { code: "SC/MATH 1013", component: "LEC", section: "01", weekday: 4, start: 570, end: 680, room: "CLH 110" },
    ]);
  });

  it("names the term from the date the caller passed when the paste has none", () => {
    expect(result.termCode).toBe("1269");
  });

  it("reads a late-August paste as the term about to start, not the one ending", () => {
    // Frosh week is exactly when a schedule with no dates gets pasted, and
    // filing it under Spring would show the student nobody.
    const august = parseGenericSchedule(YORK, { today: "2026-08-27" });
    expect(august.termCode).toBe("1269");
    const july = parseGenericSchedule(YORK, { today: "2026-07-02" });
    expect(july.termCode).toBe("1265");
  });
});

/* ------------------------------------------------------------------ *
 * Guelph-Humber — WebAdvisor / Student Planning
 * ------------------------------------------------------------------ */

const GUELPH_HUMBER = [
  "Plan, Schedule, Register & Drop",
  "Fall 2026",
  "PSYC*1000*01: Principles of Behaviour",
  "Credits: 0.50",
  "Instructor: Reid, S",
  "9/8/2026 to 12/4/2026",
  "Seats Available: 12",
  "M, W, F 10:30 AM - 11:20 AM",
  "GH 108",
  "BADM*1000*02: Introduction to Business",
  "Credits: 0.50",
  "9/8/2026 to 12/4/2026",
  "T, R 1:00 PM - 2:20 PM",
  "GH 203",
].join("\n");

describe("Guelph-Humber", () => {
  const result = parseGenericSchedule(GUELPH_HUMBER, { today: TODAY });

  it("reads the starred code, section and title", () => {
    expect(result.courses.map((c) => [c.subject, c.catalog, c.title])).toEqual([
      ["PSYC", "1000", "Principles of Behaviour"],
      ["BADM", "1000", "Introduction to Business"],
    ]);
    expect(result.courses[0].sections[0].sectionCode).toBe("01");
    expect(result.courses[1].sections[0].sectionCode).toBe("02");
  });

  it("takes the room from the line below the meeting", () => {
    expect(meetingsOf(result).map((m) => m.room)).toEqual([
      "GH 108", "GH 108", "GH 108", "GH 203", "GH 203",
    ]);
  });

  it("reads the dates, and the term from them", () => {
    expect(result.courses[0].sections[0].startDate).toBe("2026-09-08");
    expect(result.courses[0].sections[0].endDate).toBe("2026-12-04");
    expect(result.termCode).toBe("1269");
  });

  it("keeps the instructor and ignores the seat count", () => {
    expect(result.courses[0].sections[0].instructor).toBe("Reid, S");
    expect(result.courses.length).toBe(2);
  });
});

/* ------------------------------------------------------------------ *
 * Brock — my.brocku.ca Student Self Serve
 * ------------------------------------------------------------------ */

const BROCK = [
  "My Timetable",
  "Fall/Winter 2026",
  "ECON 1P92 D2 - Principles of Macroeconomics",
  "LEC  Mon, Wed  2:00 PM - 3:30 PM  TH 247",
  "SEM  Thu  9:00 AM - 10:00 AM  MC C310",
  "COSC 1P02 D1 - Introduction to Computer Science",
  "LEC  Tue, Thu  11:00 AM - 12:30 PM  TH 253",
].join("\n");

describe("Brock", () => {
  const result = parseGenericSchedule(BROCK, { today: TODAY });

  it("reads Brock's letter-and-digit catalog numbers", () => {
    expect(result.courses.map((c) => `${c.subject} ${c.catalog}`)).toEqual([
      "ECON 1P92",
      "COSC 1P02",
    ]);
  });

  it("takes the section code from the header and the component from the row", () => {
    expect(result.courses[0].sections.map((s) => `${s.component} ${s.sectionCode}`)).toEqual([
      "LEC D2",
      "SEM D2",
    ]);
  });

  it("reads days, times and rooms off a space-aligned row", () => {
    expect(meetingsOf(result)).toEqual([
      { code: "ECON 1P92", component: "LEC", section: "D2", weekday: 1, start: 840, end: 930, room: "TH 247" },
      { code: "ECON 1P92", component: "LEC", section: "D2", weekday: 3, start: 840, end: 930, room: "TH 247" },
      { code: "ECON 1P92", component: "SEM", section: "D2", weekday: 4, start: 540, end: 600, room: "MC C310" },
      { code: "COSC 1P02", component: "LEC", section: "D1", weekday: 2, start: 660, end: 750, room: "TH 253" },
      { code: "COSC 1P02", component: "LEC", section: "D1", weekday: 4, start: 660, end: 750, room: "TH 253" },
    ]);
  });

  it("keeps the title after the dash", () => {
    expect(result.courses[0].title).toBe("Principles of Macroeconomics");
  });
});

/* ------------------------------------------------------------------ *
 * The things that break a tolerant parser
 * ------------------------------------------------------------------ */

describe("false positives", () => {
  it("does not read a room as a course", () => {
    const result = parseGenericSchedule(
      ["PSYC*1000*01: Principles of Behaviour", "M W F 10:30 AM - 11:20 AM", "TH 247"].join("\n"),
      { today: TODAY },
    );
    expect(result.courses).toHaveLength(1);
    expect(result.courses[0].subject).toBe("PSYC");
  });

  it("does not read a date range as a time", () => {
    const result = parseGenericSchedule(
      ["ECON 1P92 D2 - Macro", "9/8/2026 to 12/4/2026"].join("\n"),
      { today: TODAY },
    );
    expect(meetingsOf(result)).toEqual([]);
    expect(result.courses[0].sections[0].startDate).toBe("2026-09-08");
  });

  it("does not invent a course from a seat count or a credit line", () => {
    const result = parseGenericSchedule(
      ["Seats Available: 12", "Credits: 0.50", "Room 247", "Total 5"].join("\n"),
      { today: TODAY },
    );
    expect(result.courses).toEqual([]);
  });

  it("drops a course marked dropped, and says so", () => {
    const result = parseGenericSchedule(
      [
        "ECON 1P92 D2 - Macro",
        "Dropped",
        "LEC  Mon  2:00 PM - 3:30 PM  TH 247",
        "COSC 1P02 D1 - Intro",
        "LEC  Tue  11:00 AM - 12:30 PM  TH 253",
      ].join("\n"),
      { today: TODAY },
    );
    expect(result.courses.map((c) => c.subject)).toEqual(["COSC"]);
    expect(result.warnings.some((w) => /dropped/i.test(w.reason))).toBe(true);
  });

  it("warns about a time it cannot attach to any day", () => {
    const result = parseGenericSchedule(
      ["ECON 1P92 D2 - Macro", "Whenever 2:00 PM - 3:30 PM"].join("\n"),
      { today: TODAY },
    );
    expect(result.warnings.some((w) => /which days/i.test(w.reason))).toBe(true);
  });

  it("keeps an online class with no room and no days as an enrollment", () => {
    const result = parseGenericSchedule(
      ["COSC 1P02 D1 - Intro", "Online, asynchronous", "Instructor: A Patel"].join("\n"),
      { today: TODAY },
    );
    expect(result.courses).toHaveLength(1);
    expect(result.courses[0].sections[0].meetings).toEqual([]);
    expect(result.courses[0].sections[0].instructor).toBe("A Patel");
  });
});
