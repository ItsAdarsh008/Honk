import { describe, expect, it } from "vitest";
import {
  deriveTermCode,
  parseDays,
  parseQuestSchedule,
  parseTimeRange,
  termCodeForDate,
} from "./parse";

/** Realistic browser copy of a Quest table: cells arrive tab-separated. */
const TAB_PASTE = [
  "My Class Schedule",
  "Fall 2026 | Undergraduate | University of Waterloo",
  "",
  "CS 135 - Designing Functional Programs",
  "Status\tUnits\tGrading\tGrade\tDeadlines",
  "Enrolled\t0.50\tNumeric Grading\t\tAcademic Calendar Deadlines",
  "Class Nbr\tSection\tComponent\tDays & Times\tRoom\tInstructor\tStart/End Date",
  "4280\t001\tLEC\tMWF 10:30AM-11:20AM\tMC 4020\tJ Smith\t09/08/2026 - 12/02/2026",
  "4281\t101\tTUT\tTh 2:30PM-3:20PM\tMC 4021\tTBA\t09/08/2026 - 12/02/2026",
].join("\n");

const TWO_COURSE_PASTE = [
  "MATH 137 - Calculus 1 for Honours Mathematics",
  "Enrolled\t0.50\tNumeric Grading",
  "Class Nbr\tSection\tComponent\tDays & Times\tRoom\tInstructor\tStart/End Date",
  "3120\t002\tLEC\tTTh 8:30AM-9:50AM\tMC 1085\tA Chen\t09/08/2026 - 12/02/2026",
  "",
  "CS 135 - Designing Functional Programs",
  "Enrolled\t0.50\tNumeric Grading",
  "Class Nbr\tSection\tComponent\tDays & Times\tRoom\tInstructor\tStart/End Date",
  "4280\t001\tLEC\tMWF 10:30AM-11:20AM\tMC 4020\tJ Smith\t09/08/2026 - 12/02/2026",
].join("\n");

describe("parseDays", () => {
  it("tokenizes a run-on weekday string", () => {
    expect(parseDays("MWF")).toEqual([1, 3, 5]);
  });

  it("prefers Th over T so TTh is Tuesday and Thursday", () => {
    expect(parseDays("TTh")).toEqual([2, 4]);
  });

  it("handles Th in the middle of a run", () => {
    expect(parseDays("MThF")).toEqual([1, 4, 5]);
  });

  it("reads a single day", () => {
    expect(parseDays("F")).toEqual([5]);
  });

  it("prefers Su over S", () => {
    expect(parseDays("Su")).toEqual([7]);
  });

  it("reads Saturday", () => {
    expect(parseDays("S")).toEqual([6]);
  });

  it("sorts and de-duplicates", () => {
    expect(parseDays("FMM")).toEqual([1, 5]);
  });

  it("returns null rather than guessing at unknown characters", () => {
    expect(parseDays("XQ")).toBeNull();
    expect(parseDays("")).toBeNull();
  });
});

describe("parseTimeRange", () => {
  it("parses a morning 12-hour range", () => {
    expect(parseTimeRange("10:30AM", "11:20AM")).toEqual({ startMin: 630, endMin: 680 });
  });

  it("parses an afternoon 12-hour range", () => {
    expect(parseTimeRange("2:30PM", "3:20PM")).toEqual({ startMin: 870, endMin: 920 });
  });

  it("crosses noon correctly", () => {
    expect(parseTimeRange("11:30AM", "12:20PM")).toEqual({ startMin: 690, endMin: 740 });
  });

  it("parses a 24-hour range", () => {
    expect(parseTimeRange("13:30", "14:20")).toEqual({ startMin: 810, endMin: 860 });
  });

  it("treats 12:00AM as midnight and 12:30AM as after it", () => {
    expect(parseTimeRange("12:00AM", "12:30AM")).toEqual({ startMin: 0, endMin: 30 });
  });

  it("treats 12:00PM as noon", () => {
    expect(parseTimeRange("12:00PM", "12:50PM")).toEqual({ startMin: 720, endMin: 770 });
  });

  it("accepts spaced and dotted meridiems", () => {
    expect(parseTimeRange("10:30 a.m.", "11:20 A.M.")).toEqual({ startMin: 630, endMin: 680 });
  });

  it("infers a missing meridiem from the other end of the range", () => {
    expect(parseTimeRange("11:30", "12:20PM")).toEqual({ startMin: 690, endMin: 740 });
  });

  it("rejects a range that ends before it starts", () => {
    expect(parseTimeRange("3:00PM", "10:00AM")).toBeNull();
    expect(parseTimeRange("nonsense", "10:00AM")).toBeNull();
  });
});

describe("term codes", () => {
  it("maps a September start to the fall term", () => {
    expect(termCodeForDate("2026-09-08")).toBe("1269");
  });

  it("maps a January start to the winter term", () => {
    expect(termCodeForDate("2027-01-05")).toBe("1271");
  });

  it("maps a May start to the spring term", () => {
    expect(termCodeForDate("2026-05-04")).toBe("1265");
  });

  it("returns null for something that is not a date", () => {
    expect(termCodeForDate("not-a-date")).toBeNull();
  });

  it("derives the term from the earliest section start date", () => {
    const { courses } = parseQuestSchedule(TAB_PASTE);
    expect(deriveTermCode(courses)).toBe("1269");
  });
});

describe("parseQuestSchedule", () => {
  it("reads a standard tab-separated block into one course", () => {
    const { courses } = parseQuestSchedule(TAB_PASTE);
    expect(courses).toHaveLength(1);
    expect(courses[0].subject).toBe("CS");
    expect(courses[0].catalog).toBe("135");
    expect(courses[0].title).toBe("Designing Functional Programs");
  });

  it("reads both sections of the course", () => {
    const { courses } = parseQuestSchedule(TAB_PASTE);
    expect(courses[0].sections.map((s) => s.classNumber)).toEqual([4280, 4281]);
    expect(courses[0].sections.map((s) => s.component)).toEqual(["LEC", "TUT"]);
    expect(courses[0].sections.map((s) => s.sectionCode)).toEqual(["001", "101"]);
  });

  it("expands MWF into three meetings at the same time", () => {
    const { courses } = parseQuestSchedule(TAB_PASTE);
    const lec = courses[0].sections[0];
    expect(lec.meetings.map((m) => m.weekday)).toEqual([1, 3, 5]);
    expect(lec.meetings.every((m) => m.startMin === 630 && m.endMin === 680)).toBe(true);
  });

  it("puts a Thursday tutorial on weekday 4", () => {
    const { courses } = parseQuestSchedule(TAB_PASTE);
    const tut = courses[0].sections[1];
    expect(tut.meetings).toHaveLength(1);
    expect(tut.meetings[0]).toMatchObject({ weekday: 4, startMin: 870, endMin: 920 });
  });

  it("keeps the room as the meeting location", () => {
    const { courses } = parseQuestSchedule(TAB_PASTE);
    expect(courses[0].sections[0].meetings[0].location).toBe("MC 4020");
  });

  it("reads the instructor and turns TBA into null", () => {
    const { courses } = parseQuestSchedule(TAB_PASTE);
    expect(courses[0].sections[0].instructor).toBe("J Smith");
    expect(courses[0].sections[1].instructor).toBeNull();
  });

  it("converts the date range to ISO dates", () => {
    const { courses } = parseQuestSchedule(TAB_PASTE);
    expect(courses[0].sections[0].startDate).toBe("2026-09-08");
    expect(courses[0].sections[0].endDate).toBe("2026-12-02");
  });

  it("reports the term code on the result", () => {
    expect(parseQuestSchedule(TAB_PASTE).termCode).toBe("1269");
  });

  it("produces no warnings for a clean paste", () => {
    expect(parseQuestSchedule(TAB_PASTE).warnings).toEqual([]);
  });

  it("reads a paste from an account set to 24-hour time", () => {
    const paste = [
      "CS 136 - Elementary Algorithm Design",
      "Class Nbr\tSection\tComponent\tDays & Times\tRoom\tInstructor\tStart/End Date",
      "4300\t001\tLEC\tMWF 13:30-14:20\tSTC 0060\tD Patel\t09/08/2026 - 12/02/2026",
    ].join("\n");
    const { courses } = parseQuestSchedule(paste);
    expect(courses[0].sections[0].meetings[0]).toMatchObject({ startMin: 810, endMin: 860 });
  });

  it("reads a column-aligned paste with no tabs", () => {
    const paste = [
      "CS 135 - Designing Functional Programs",
      "Class Nbr  Section  Component  Days & Times          Room       Instructor    Start/End Date",
      "4280       001      LEC        MWF 10:30AM-11:20AM   MC 4020    J Smith       09/08/2026 - 12/02/2026",
    ].join("\n");
    const { courses, warnings } = parseQuestSchedule(paste);
    expect(warnings).toEqual([]);
    expect(courses[0].sections[0]).toMatchObject({
      classNumber: 4280,
      sectionCode: "001",
      component: "LEC",
      instructor: "J Smith",
    });
    expect(courses[0].sections[0].meetings[0].location).toBe("MC 4020");
  });

  it("reads a flattened single-spaced row", () => {
    const paste = [
      "CS 135 - Designing Functional Programs",
      "4280 001 LEC MWF 10:30AM-11:20AM MC 4020 J Smith 09/08/2026 - 12/02/2026",
    ].join("\n");
    const { courses } = parseQuestSchedule(paste);
    expect(courses[0].sections[0]).toMatchObject({
      classNumber: 4280,
      component: "LEC",
      instructor: "J Smith",
    });
    expect(courses[0].sections[0].meetings).toHaveLength(3);
    expect(courses[0].sections[0].meetings[0].location).toBe("MC 4020");
  });

  it("keeps the enrollment when days and times are TBA", () => {
    const paste = [
      "CS 137 - Programming Principles",
      "Class Nbr\tSection\tComponent\tDays & Times\tRoom\tInstructor\tStart/End Date",
      "4400\t001\tLEC\tTBA\tTBA\tTBA\t09/08/2026 - 12/02/2026",
    ].join("\n");
    const { courses } = parseQuestSchedule(paste);
    expect(courses[0].sections[0].classNumber).toBe(4400);
    expect(courses[0].sections[0].meetings).toEqual([]);
    expect(courses[0].sections[0].instructor).toBeNull();
  });

  it("nulls the location when only the room is TBA", () => {
    const paste = [
      "CS 137 - Programming Principles",
      "4400\t001\tLEC\tMW 9:00AM-10:20AM\tTBA\tR Singh\t09/08/2026 - 12/02/2026",
    ].join("\n");
    const { courses } = parseQuestSchedule(paste);
    expect(courses[0].sections[0].meetings[0].location).toBeNull();
    expect(courses[0].sections[0].instructor).toBe("R Singh");
  });

  it("keeps an online course as an enrollment with no meetings", () => {
    const paste = [
      "PSYCH 101 - Introductory Psychology",
      "Class Nbr\tSection\tComponent\tDays & Times\tRoom\tInstructor\tStart/End Date",
      "5100\t081\tONL\tTBA\tONLINE\tK Nguyen\t09/08/2026 - 12/02/2026",
    ].join("\n");
    const { courses } = parseQuestSchedule(paste);
    expect(courses[0].sections[0].component).toBe("ONL");
    expect(courses[0].sections[0].meetings).toEqual([]);
    expect(courses[0].sections[0].instructor).toBe("K Nguyen");
  });

  it("keeps every component of a multi-component course as its own section", () => {
    const paste = [
      "PHYS 121 - Mechanics",
      "Class Nbr\tSection\tComponent\tDays & Times\tRoom\tInstructor\tStart/End Date",
      "6000\t001\tLEC\tMWF 9:30AM-10:20AM\tRCH 101\tL Rossi\t09/08/2026 - 12/02/2026",
      "6001\t101\tTUT\tT 11:30AM-12:20PM\tRCH 105\tTBA\t09/08/2026 - 12/02/2026",
      "6002\t201\tLAB\tW 2:30PM-5:20PM\tPHY 145\tTBA\t09/08/2026 - 12/02/2026",
    ].join("\n");
    const { courses } = parseQuestSchedule(paste);
    expect(courses).toHaveLength(1);
    expect(courses[0].sections.map((s) => s.component)).toEqual(["LEC", "TUT", "LAB"]);
    expect(courses[0].sections[2].meetings[0]).toMatchObject({ weekday: 3, startMin: 870, endMin: 1040 });
  });

  it("merges a repeated class number into one section with two meeting patterns", () => {
    const paste = [
      "BUS 111W - Introduction to Business Organization",
      "Class Nbr\tSection\tComponent\tDays & Times\tRoom\tInstructor\tStart/End Date",
      "7000\t001\tLEC\tM 10:00AM-11:20AM\tBA 201\tP Weber\t09/08/2026 - 10/16/2026",
      "7000\t001\tLEC\tW 1:00PM-2:20PM\tBA 201\tP Weber\t10/26/2026 - 12/02/2026",
    ].join("\n");
    const { courses } = parseQuestSchedule(paste);
    expect(courses[0].sections).toHaveLength(1);
    expect(courses[0].sections[0].meetings.map((m) => m.weekday)).toEqual([1, 3]);
  });

  it("attaches a continuation row with no class number to the section above it", () => {
    const paste = [
      "ENGL 109 - Introduction to Academic Writing",
      "Class Nbr\tSection\tComponent\tDays & Times\tRoom\tInstructor\tStart/End Date",
      "8000\t001\tLEC\tT 1:00PM-2:20PM\tHH 138\tM Okafor\t09/08/2026 - 12/02/2026",
      "\tTh 1:00PM-2:20PM\tHH 138\t\t09/08/2026 - 12/02/2026",
    ].join("\n");
    const { courses, warnings } = parseQuestSchedule(paste);
    expect(warnings).toEqual([]);
    expect(courses[0].sections).toHaveLength(1);
    expect(courses[0].sections[0].meetings.map((m) => m.weekday)).toEqual([2, 4]);
    expect(courses[0].sections[0].meetings[1].location).toBe("HH 138");
  });

  it("leaves dropped courses out and says so", () => {
    const paste = [
      "CS 135 - Designing Functional Programs",
      "Enrolled\t0.50\tNumeric Grading",
      "4280\t001\tLEC\tMWF 10:30AM-11:20AM\tMC 4020\tJ Smith\t09/08/2026 - 12/02/2026",
      "ECON 101 - Introduction to Microeconomics",
      "Dropped\t0.50\tNumeric Grading",
      "9000\t001\tLEC\tTTh 4:00PM-5:20PM\tAL 113\tS Ahmed\t09/08/2026 - 12/02/2026",
    ].join("\n");
    const { courses, warnings } = parseQuestSchedule(paste);
    expect(courses.map((c) => c.subject)).toEqual(["CS"]);
    expect(warnings.some((w) => w.text === "ECON 101" && /dropped/i.test(w.reason))).toBe(true);
  });

  it("keeps waitlisted courses", () => {
    const paste = [
      "STAT 230 - Probability",
      "Waitlisted\t0.50\tNumeric Grading",
      "9500\t001\tLEC\tMWF 8:30AM-9:20AM\tMC 2054\tG Liu\t09/08/2026 - 12/02/2026",
    ].join("\n");
    const { courses } = parseQuestSchedule(paste);
    expect(courses).toHaveLength(1);
    expect(courses[0].status).toBe("waitlisted");
  });

  it("ignores navigation chrome and column headings without warning", () => {
    const paste = [
      "Search  Plan  Enroll  My Academics",
      "My Class Schedule",
      "Select Display Option",
      "Printer Friendly Page",
      "Fall 2026 | Undergraduate | University of Waterloo",
      "CS 135 - Designing Functional Programs",
      "Class Nbr\tSection\tComponent\tDays & Times\tRoom\tInstructor\tStart/End Date",
      "4280\t001\tLEC\tMWF 10:30AM-11:20AM\tMC 4020\tJ Smith\t09/08/2026 - 12/02/2026",
      "Go to top",
    ].join("\n");
    const { courses, warnings } = parseQuestSchedule(paste);
    expect(courses).toHaveLength(1);
    expect(warnings).toEqual([]);
  });

  it("warns rather than dropping a row that looks like data but cannot be read", () => {
    const paste = [
      "CS 135 - Designing Functional Programs",
      "4280\t001\tLEC\tMWF 10:30AM-11:20AM\tMC 4020\tJ Smith\t09/08/2026 - 12/02/2026",
      "42811 !! garbage row that lost its columns",
    ].join("\n");
    const { courses, warnings } = parseQuestSchedule(paste);
    expect(courses[0].sections).toHaveLength(1);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].line).toBe(3);
  });

  it("warns about a class row that appears before any course heading", () => {
    const paste = "4280\t001\tLEC\tMWF 10:30AM-11:20AM\tMC 4020\tJ Smith\t09/08/2026 - 12/02/2026";
    const { courses, warnings } = parseQuestSchedule(paste);
    expect(courses).toEqual([]);
    expect(warnings[0].reason).toMatch(/no course heading/i);
  });

  it("returns an empty result for empty input", () => {
    expect(parseQuestSchedule("")).toEqual({ courses: [], warnings: [], termCode: null });
  });

  it("returns no courses for text that is not a schedule", () => {
    const { courses } = parseQuestSchedule("hello there\nthis is not a schedule at all");
    expect(courses).toEqual([]);
  });

  it("drops a course heading that has no sections under it", () => {
    const { courses } = parseQuestSchedule("CS 135 - Designing Functional Programs");
    expect(courses).toEqual([]);
  });

  it("handles Windows line endings and non-breaking spaces", () => {
    const paste =
      "CS 135 - Designing Functional Programs\r\n" +
      "4280\t001\tLEC\tMWF 10:30AM-11:20AM\tMC 4020\tJ Smith\t09/08/2026 - 12/02/2026\r\n";
    const { courses } = parseQuestSchedule(paste);
    expect(courses[0].sections[0].meetings).toHaveLength(3);
  });

  it("keeps several courses in the order they appear", () => {
    const { courses } = parseQuestSchedule(TWO_COURSE_PASTE);
    expect(courses.map((c) => `${c.subject} ${c.catalog}`)).toEqual(["MATH 137", "CS 135"]);
    expect(courses[0].sections[0].meetings.map((m) => m.weekday)).toEqual([2, 4]);
  });

  it("reads a catalog number with a letter suffix", () => {
    const paste = [
      "BUS 111W - Introduction to Business Organization",
      "7000\t001\tLEC\tM 10:00AM-11:20AM\tBA 201\tP Weber\t09/08/2026 - 12/02/2026",
    ].join("\n");
    const { courses } = parseQuestSchedule(paste);
    expect(courses[0]).toMatchObject({ subject: "BUS", catalog: "111W" });
  });

  it("does not mistake a room number for a class number", () => {
    const paste = [
      "CS 135 - Designing Functional Programs",
      "4280\t001\tLEC\tMWF 10:30AM-11:20AM\tE7 2317\tJ Smith\t09/08/2026 - 12/02/2026",
    ].join("\n");
    const { courses } = parseQuestSchedule(paste);
    expect(courses[0].sections).toHaveLength(1);
    expect(courses[0].sections[0].classNumber).toBe(4280);
    expect(courses[0].sections[0].meetings[0].location).toBe("E7 2317");
  });

  it("reads a five-digit class number", () => {
    const paste = [
      "AFM 101 - Introduction to Financial Accounting",
      "12345\t001\tLEC\tTTh 11:30AM-12:50PM\tHH 1101\tC Dubois\t09/08/2026 - 12/02/2026",
    ].join("\n");
    const { courses } = parseQuestSchedule(paste);
    expect(courses[0].sections[0].classNumber).toBe(12345);
  });

  it("handles an en dash in the date range", () => {
    const paste = [
      "CS 135 - Designing Functional Programs",
      "4280\t001\tLEC\tMWF 10:30AM-11:20AM\tMC 4020\tJ Smith\t09/08/2026 – 12/02/2026",
    ].join("\n");
    const { courses } = parseQuestSchedule(paste);
    expect(courses[0].sections[0].startDate).toBe("2026-09-08");
    expect(courses[0].sections[0].endDate).toBe("2026-12-02");
  });

  it("keeps a multi-word instructor name intact", () => {
    const paste = [
      "CS 135 - Designing Functional Programs",
      "4280\t001\tLEC\tMWF 10:30AM-11:20AM\tMC 4020\tJane Q Smith-Okonkwo\t09/08/2026 - 12/02/2026",
    ].join("\n");
    const { courses } = parseQuestSchedule(paste);
    expect(courses[0].sections[0].instructor).toBe("Jane Q Smith-Okonkwo");
  });

  it("reads a MM/DD range the ordinary way", () => {
    const paste = [
      "CS 135 - Designing Functional Programs",
      "4280\t001\tLEC\tMWF 10:30AM-11:20AM\tMC 4020\tJ Smith\t09/08/2026 - 12/02/2026",
    ].join("\n");
    const { courses, termCode } = parseQuestSchedule(paste);
    expect(courses[0].sections[0].startDate).toBe("2026-09-08");
    expect(termCode).toBe("1269");
  });

  it("reads a DD/MM range when only that ordering makes a real term", () => {
    // 15 September to 4 December. Under MM/DD the 15th would be a 15th month.
    const paste = [
      "CS 135 - Designing Functional Programs",
      "4280\t001\tLEC\tMWF 10:30AM-11:20AM\tMC 4020\tJ Smith\t15/09/2026 - 04/12/2026",
    ].join("\n");
    const { courses, termCode } = parseQuestSchedule(paste);
    expect(courses[0].sections[0].startDate).toBe("2026-09-15");
    expect(courses[0].sections[0].endDate).toBe("2026-12-04");
    expect(termCode).toBe("1269");
  });

  it("rejects a reading that would run backwards", () => {
    // Under DD/MM this would be 9 August to 12 February — a term that ends
    // before it starts, so the MM/DD reading has to be the right one.
    const paste = [
      "CS 135 - Designing Functional Programs",
      "4280\t001\tLEC\tMWF 10:30AM-11:20AM\tMC 4020\tJ Smith\t09/08/2026 - 12/02/2026",
    ].join("\n");
    const { courses } = parseQuestSchedule(paste);
    expect(courses[0].sections[0].startDate).toBe("2026-09-08");
    expect(courses[0].sections[0].endDate).toBe("2026-12-02");
  });

  it("derives a winter term code from a January paste", () => {
    const paste = [
      "CS 136 - Elementary Algorithm Design",
      "4300\t001\tLEC\tMWF 13:30-14:20\tSTC 0060\tD Patel\t01/05/2027 - 04/07/2027",
    ].join("\n");
    expect(parseQuestSchedule(paste).termCode).toBe("1271");
  });
});
