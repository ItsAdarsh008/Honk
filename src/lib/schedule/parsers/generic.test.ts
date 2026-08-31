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
import { sectionKeyFor } from "../types";

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

/* ------------------------------------------------------------------ *
 * Reported by a real student
 * ------------------------------------------------------------------ */

/**
 * A Schulich student could not save his winter term: two required components
 * of one course, and the site refused the whole paste with "that schedule
 * lists the same class twice". His fall term, which had one component per
 * course, saved fine.
 *
 * York prints each component as its own block with the course code repeated
 * above it, and the parser started a brand-new course on the second header.
 */
const YORK_TWO_COMPONENTS = [
  "Winter 2027",
  "SB/ACTG 2010 3.00\tSection A\tIntroduction to Financial Accounting",
  "LECT 01\tMon\t11:30 - 13:20\tSSB 108\tR Chen",
  "SB/ACTG 2010 3.00\tSection A\tIntroduction to Financial Accounting",
  "TUTR 02\tWed\t14:30 - 15:20\tSSB 204\tTBA",
].join("\n");

describe("a course whose components are printed as separate blocks", () => {
  const result = parseGenericSchedule(YORK_TWO_COMPONENTS, { today: TODAY });

  it("reads them as one course, not two", () => {
    expect(result.courses).toHaveLength(1);
    expect(`${result.courses[0].subject} ${result.courses[0].catalog}`).toBe("SB/ACTG 2010");
  });

  it("keeps both components as their own sections", () => {
    expect(result.courses[0].sections.map((s) => s.component).sort()).toEqual(["LEC", "TUT"]);
  });

  it("gives the two components different identities", () => {
    const [a, b] = result.courses[0].sections;
    expect(sectionKeyFor("SB/ACTG", "2010", a)).not.toBe(sectionKeyFor("SB/ACTG", "2010", b));
  });

  it("keeps every meeting", () => {
    expect(meetingsOf(result)).toHaveLength(2);
  });
});

describe("component codes the registrars actually print", () => {
  it("does not collapse an unfamiliar code onto LEC", () => {
    // Two blocks whose components differ only by a code the table has to know.
    const paste = [
      "SB/MGMT 1000 3.00\tSection B\tStrategy",
      "BLEN 01\tTue\t9:00 - 10:20\tSSB 101\tTBA",
      "SB/MGMT 1000 3.00\tSection B\tStrategy",
      "STDO 02\tThu\t9:00 - 10:20\tSSB 102\tTBA",
    ].join("\n");
    const parsed = parseGenericSchedule(paste, { today: TODAY });
    expect(parsed.courses).toHaveLength(1);
    expect(parsed.courses[0].sections.map((s) => s.component).sort()).toEqual(["BLN", "STU"]);
  });
});

/* ------------------------------------------------------------------ *
 * Section identity
 * ------------------------------------------------------------------ */

describe("section identity", () => {
  it("uses a section code the portal actually printed", () => {
    const section = parseGenericSchedule(
      ["ECON 1P92 D2 - Macro", "LEC  Mon  2:00 PM - 3:30 PM  TH 247"].join("\n"),
      { today: TODAY },
    ).courses[0].sections[0];

    expect(section.sectionCodeInferred).toBeFalsy();
    expect(sectionKeyFor("ECON", "1P92", section)).toBe("ECON.1P92.LEC.D2");
  });

  it("keys an unnumbered section on its meeting pattern, not on a made-up code", () => {
    /*
     * Two different lectures of one course, neither printing a section code.
     * Defaulting both to "01" merged them into a single shared row — which
     * would make two people in different rooms each other's classmates, and
     * being classmates is what lets a friend see a room.
     */
    const morning = parseGenericSchedule(
      ["PSYC 1000 - Intro", "Mon 9:00 AM - 10:00 AM"].join("\n"),
      { today: TODAY },
    ).courses[0].sections[0];
    const afternoon = parseGenericSchedule(
      ["PSYC 1000 - Intro", "Mon 2:00 PM - 3:00 PM"].join("\n"),
      { today: TODAY },
    ).courses[0].sections[0];

    expect(morning.sectionCodeInferred).toBe(true);
    expect(morning.sectionCode).toBe("01");
    expect(afternoon.sectionCode).toBe("01");
    expect(sectionKeyFor("PSYC", "1000", morning)).not.toBe(
      sectionKeyFor("PSYC", "1000", afternoon),
    );
  });

  it("still merges two pastes of the same unnumbered lecture", () => {
    const paste = ["PSYC 1000 - Intro", "Mon, Wed 9:00 AM - 10:00 AM"].join("\n");
    const mine = parseGenericSchedule(paste, { today: TODAY }).courses[0].sections[0];
    const theirs = parseGenericSchedule(paste, { today: TODAY }).courses[0].sections[0];
    expect(sectionKeyFor("PSYC", "1000", mine)).toBe(sectionKeyFor("PSYC", "1000", theirs));
  });
});

/* ------------------------------------------------------------------ *
 * Laurier
 * ------------------------------------------------------------------ */

/**
 * LORIS, which is Banner, and which looks like nothing else in this file.
 *
 * Two things about the layout broke the parser outright rather than costing it
 * a room. The header leads with the *title* and buries the code in the middle,
 * and Laurier welds the code together — `EC120`, never `EC 120`, and the
 * separator between letters and digits used to be mandatory. Either one alone
 * was fatal; together they meant a LORIS paste produced zero courses and the
 * student got "Nothing readable in there yet".
 *
 * Reconstructed from Banner's Student Detail Schedule layout, not taken from a
 * real student's paste, so it sits with the York and Brock fixtures above
 * rather than with the Quest one. It proves the shape is read, not that this
 * is the shape Laurier prints — which is why Laurier stays in beta until
 * somebody actually pastes into it.
 */
const LORIS = [
  "Student Detail Schedule",
  "",
  "Total Credit Hours: 2.500",
  "Introduction to Microeconomics - EC120 - A",
  "Associated Term: Fall 2026",
  "CRN: 30412",
  "Status: Registered on Jul 15, 2026",
  "Assigned Instructor: Jane Doe",
  "Grade Mode: Standard Numeric",
  "Credits: 0.500",
  "",
  "Scheduled Meeting Times",
  "Type\tTime\tDays\tWhere\tDate Range\tSchedule Type\tInstructors",
  "Class\t10:00 am - 11:20 am\tMW\tBricker Academic Building 101\tSep 08, 2026 - Dec 05, 2026\tLecture\tJane Doe (P)",
  "",
  "Business Foundations - BU111 - B",
  "Associated Term: Fall 2026",
  "CRN: 30877",
  "Status: Registered on Jul 15, 2026",
  "Assigned Instructor: John Roe",
  "",
  "Scheduled Meeting Times",
  "Type\tTime\tDays\tWhere\tDate Range\tSchedule Type\tInstructors",
  "Class\t1:00 pm - 2:20 pm\tTR\tPeters Building P1025\tSep 08, 2026 - Dec 05, 2026\tLecture\tJohn Roe (P)",
  "Class\t3:30 pm - 4:20 pm\tF\tLazaridis Hall 1011\tSep 08, 2026 - Dec 05, 2026\tTutorial\tJohn Roe (P)",
].join("\n");

describe("Laurier", () => {
  const result = parseGenericSchedule(LORIS, { today: TODAY });

  it("reads a code with nothing between the letters and the digits", () => {
    expect(result.courses.map((c) => `${c.subject} ${c.catalog}`)).toEqual(["EC 120", "BU 111"]);
  });

  it("finds the code in the middle of a title-first header", () => {
    expect(result.courses[0].title).toBe("Introduction to Microeconomics");
    expect(result.courses[1].title).toBe("Business Foundations");
  });

  it("takes the section code Banner printed rather than inferring one", () => {
    const sections = result.courses.flatMap((c) => c.sections);
    expect(sections.map((s) => s.sectionCode)).toEqual(["A", "B", "B"]);
    expect(sections.every((s) => s.sectionCodeInferred !== true)).toBe(true);
  });

  it("keeps the tutorial apart from the lecture it shares a section code with", () => {
    expect(result.courses[1].sections.map((s) => s.component)).toEqual(["LEC", "TUT"]);
    const [lecture, tutorial] = result.courses[1].sections;
    expect(sectionKeyFor("BU", "111", lecture)).not.toBe(sectionKeyFor("BU", "111", tutorial));
  });

  it("reads days, times and the spelled-out building", () => {
    expect(meetingsOf(result)).toEqual([
      { code: "EC 120", component: "LEC", section: "A", weekday: 1, start: 600, end: 680, room: "Bricker Academic Building 101" },
      { code: "EC 120", component: "LEC", section: "A", weekday: 3, start: 600, end: 680, room: "Bricker Academic Building 101" },
      { code: "BU 111", component: "LEC", section: "B", weekday: 2, start: 780, end: 860, room: "Peters Building P1025" },
      { code: "BU 111", component: "LEC", section: "B", weekday: 4, start: 780, end: 860, room: "Peters Building P1025" },
      { code: "BU 111", component: "TUT", section: "B", weekday: 5, start: 930, end: 980, room: "Lazaridis Hall 1011" },
    ]);
  });

  it("reads the dates, the term and the instructor, and warns about nothing", () => {
    expect(result.termCode).toBe("1269");
    expect(result.courses[0].sections[0].startDate).toBe("2026-09-08");
    expect(result.courses[0].sections[0].endDate).toBe("2026-12-05");
    expect(result.courses[0].sections[0].instructor).toBe("Jane Doe");
    expect(result.warnings).toEqual([]);
  });

  it("leaves no empty section behind when the block names an instructor first", () => {
    const lab = parseGenericSchedule(
      [
        "Organic Chemistry Laboratory - CH234 - L1",
        "Assigned Instructor: R Singh",
        "Type\tTime\tDays\tWhere\tDate Range\tSchedule Type",
        "Class\t2:30 pm - 5:20 pm\tW\tScience Building N2075\tSep 08, 2026 - Dec 05, 2026\tLab",
      ].join("\n"),
      { today: TODAY },
    );
    expect(lab.courses[0].sections.map((s) => s.component)).toEqual(["LAB"]);
    expect(lab.courses[0].sections[0].instructor).toBe("R Singh");
  });

  it("still refuses a meeting row with no header above it", () => {
    const orphan = parseGenericSchedule(
      "Class\t10:00 am - 11:20 am\tMW\tBricker Academic Building 101\tSep 08, 2026 - Dec 05, 2026\tLecture",
      { today: TODAY },
    );
    expect(orphan.courses).toEqual([]);
    expect(orphan.warnings.some((w) => /no course code/i.test(w.reason))).toBe(true);
  });

  it("still refuses a welded room code as a course", () => {
    const room = parseGenericSchedule(["BA101", "M W 10:30 AM - 11:20 AM"].join("\n"), {
      today: TODAY,
    });
    expect(room.courses).toEqual([]);
  });

  it("does not read three short codes in a row as a title-first header", () => {
    const notAHeader = parseGenericSchedule("LEC - EC120 - A", { today: TODAY });
    expect(notAHeader.courses).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * Laurier, from a real paste
 * ------------------------------------------------------------------ */

/**
 * A real LORIS schedule, and a third Banner shape again.
 *
 * The fixture above this one was reconstructed from Banner's Student Detail
 * Schedule and read fine. This is what a Laurier student actually pastes — the
 * Banner 9 registration view — and it shared none of that layout's assumptions:
 *
 *   - the header is pipe-delimited, and the code is in the second cell
 *   - the subject is *spelled out*: `Mathematics 123`, not `MA123`
 *   - the days sit on a line of their own, above the time
 *   - under that line is a seven-row checkbox grid, one letter per line, whose
 *     last row is `S`
 *   - the room is labelled rather than coded: `Building: ... Room: ...`
 *   - the date range is joined by a doubled hyphen
 *   - the instructor carries a `(Primary)` role
 *
 * Every one of those was fatal or lossy, and together they produced no courses
 * at all. Instructor names are changed, the way the Quest fixture's are; the
 * layout is otherwise exactly as pasted, trailing spaces included.
 */
const LORIS_REAL = [
  "Intro Linear Algebra with App | Mathematics 123 Section A | Class Begin: 09/10/2026 | Class End: 12/09/2026 Registered",
  "Message: **Enrolled** | Credits: 0.5 | Level: Undergraduate | Campus: Waterloo | Schedule Type: Lecture | Instructional Method: Lecture | Grade Mode: Normal Grading Mode | Waitlist Position: 0",
  "09/10/2026 -- 12/09/2026   ",
  "Tuesday,Thursday",
  "S",
  "M",
  "T",
  "W",
  "R",
  "F",
  "S",
  "   11:30 AM - 12:50 PM Type: Class Location: Waterloo Building: Arts Building Room: 1E1",
  "Instructor: A Lecturer (Primary)",
  "CRN: 3071",
  "Intro Linear Algebra with App | Mathematics 123 Section L2 | Class Begin: 09/10/2026 | Class End: 12/09/2026 Registered",
  "09/10/2026 -- 12/09/2026   ",
  "Monday",
  "S",
  "M",
  "T",
  "W",
  "R",
  "F",
  "S",
  "   12:30 PM - 01:20 PM Type: Class Location: Waterloo Building: Lazaridis Hall Room: LH3060",
  "No specified Instructor",
  "CRN: 3074",
  "Understanding Bus. Environment | Business 111 Section A | Class Begin: 09/10/2026 | Class End: 12/09/2026 Registered",
  "09/10/2026 -- 12/09/2026   ",
  "Monday,Wednesday",
  "S",
  "M",
  "T",
  "W",
  "R",
  "F",
  "S",
  "   08:30 AM - 09:50 AM Type: Class Location: Waterloo Building: Lazaridis Hall Room: LH3094",
  "Instructor: B Professor (Primary)",
  "CRN: 15",
  "Understanding Bus. Environment | Business 111 Section 34 | Class Begin: 09/10/2026 | Class End: 12/09/2026 Registered",
  "09/10/2026 -- 12/09/2026   ",
  "Wednesday",
  "S",
  "M",
  "T",
  "W",
  "R",
  "F",
  "S",
  "   07:00 PM - 08:20 PM Type: Class Location: Waterloo Building: Arts Building Room: 2C4",
  "No specified Instructor",
  "CRN: 259",
  "Intro to Data Analytics | Data Science 100 Section A | Class Begin: 09/10/2026 | Class End: 12/09/2026 Registered",
  "09/10/2026 -- 12/09/2026   ",
  "Tuesday,Thursday",
  "S",
  "M",
  "T",
  "W",
  "R",
  "F",
  "S",
  "   02:30 PM - 03:50 PM Type: Class Location: Waterloo Building: Lazaridis Hall Room: LH1010",
  "Instructor: C Instructor (Primary)",
  "CRN: 1758",
].join("\n");

describe("Laurier, from a real LORIS paste", () => {
  const result = parseGenericSchedule(LORIS_REAL, { today: "2026-08-31" });

  it("reads every course, and reads nothing it should not", () => {
    expect(result.courses.map((c) => `${c.subject} ${c.catalog}`)).toEqual([
      "MATHEMATICS 123",
      "BUSINESS 111",
      "DATA SCIENCE 100",
    ]);
    expect(result.warnings).toEqual([]);
  });

  it("keeps the subject as LORIS spelled it rather than inventing a code", () => {
    // Laurier's real codes are MA, BU and DATA — none of them derivable from
    // the names above, which is exactly why none of them is guessed at.
    expect(result.courses[2].subject).toBe("DATA SCIENCE");
    expect(result.courses[2].title).toBe("Intro to Data Analytics");
  });

  it("puts both sections of a repeated course under one course", () => {
    expect(result.courses[0].sections.map((s) => s.sectionCode)).toEqual(["A", "L2"]);
    expect(result.courses[1].sections.map((s) => s.sectionCode)).toEqual(["A", "34"]);
    expect(result.courses.flatMap((c) => c.sections).every((s) => s.sectionCodeInferred !== true)).toBe(true);
  });

  it("takes the days from the line above the time, not from the checkbox grid", () => {
    // The grid's last row is `S`. Reading it would put every class on Saturday.
    expect(meetingsOf(result).every((m) => m.weekday >= 1 && m.weekday <= 5)).toBe(true);
    expect(meetingsOf(result)).toEqual([
      { code: "MATHEMATICS 123", component: "LEC", section: "A", weekday: 2, start: 690, end: 770, room: "Arts Building 1E1" },
      { code: "MATHEMATICS 123", component: "LEC", section: "A", weekday: 4, start: 690, end: 770, room: "Arts Building 1E1" },
      { code: "MATHEMATICS 123", component: "LEC", section: "L2", weekday: 1, start: 750, end: 800, room: "Lazaridis Hall LH3060" },
      { code: "BUSINESS 111", component: "LEC", section: "A", weekday: 1, start: 510, end: 590, room: "Lazaridis Hall LH3094" },
      { code: "BUSINESS 111", component: "LEC", section: "A", weekday: 3, start: 510, end: 590, room: "Lazaridis Hall LH3094" },
      { code: "BUSINESS 111", component: "LEC", section: "34", weekday: 3, start: 1140, end: 1220, room: "Arts Building 2C4" },
      { code: "DATA SCIENCE 100", component: "LEC", section: "A", weekday: 2, start: 870, end: 950, room: "Lazaridis Hall LH1010" },
      { code: "DATA SCIENCE 100", component: "LEC", section: "A", weekday: 4, start: 870, end: 950, room: "Lazaridis Hall LH1010" },
    ]);
  });

  it("reads a date range joined by a doubled hyphen, and the term from it", () => {
    expect(result.courses[0].sections[0].startDate).toBe("2026-09-10");
    expect(result.courses[0].sections[0].endDate).toBe("2026-12-09");
    expect(result.termCode).toBe("1269");
  });

  it("drops the instructor's role, and leaves an unstaffed section unstaffed", () => {
    expect(result.courses[0].sections[0].instructor).toBe("A Lecturer");
    expect(result.courses[0].sections[1].instructor).toBeNull();
  });

  it("gives every section its own identity", () => {
    const keys = result.courses.flatMap((c) =>
      c.sections.map((s) => sectionKeyFor(c.subject, c.catalog, s)),
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("does not read the status line as a course", () => {
    const status = parseGenericSchedule(
      "Message: **Enrolled** | Credits: 0.5 | Level: Undergraduate | Campus: Waterloo | Waitlist Position: 0",
      { today: TODAY },
    );
    expect(status.courses).toEqual([]);
  });
});
