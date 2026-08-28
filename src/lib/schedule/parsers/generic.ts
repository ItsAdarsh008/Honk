/**
 * The tolerant parser — everything that is not PeopleSoft.
 *
 * York prints a timetable out of REM, Brock out of Self Serve, Guelph-Humber
 * out of Ellucian Student Planning. No two of them agree on column order, day
 * abbreviations, or whether a section even has a number, and none of them is
 * a table this parser can rely on the shape of.
 *
 * So it does not try. Instead of a state machine over known columns, this
 * looks for the two things every timetable in the world prints and nothing
 * else does: a **course code** (letters then a number, `PSYC*1000`, `AP/ECON
 * 1000`, `ECON 1P92`) and a **day-and-time run** (`MWF 10:30AM-11:20AM`, `Mon
 * 11:30 - 13:20`, `M, W, F 10:30 AM - 11:20 AM`). A meeting attaches to the
 * most recent course code above it. Everything else on the line — room,
 * instructor, section, component — is read if it is recognisable and left null
 * if it is not.
 *
 * The trade, stated plainly: this is worse than the PeopleSoft parser on a
 * PeopleSoft paste and it will sometimes miss a room. It is the difference
 * between a school working on day one and a school waiting for me to get a
 * real paste out of it, and the review screen shows the user exactly what was
 * read before anything is saved. A missed room is visible and fixable. A
 * school that does not work is not.
 *
 * Pure. No I/O, no clock — the caller passes `today` when a paste carries no
 * dates to derive a term from.
 */

import {
  deriveTermCode,
  termCodeForPasteDate,
  type ParsedCourse,
  type ParsedMeeting,
  type ParseResult,
  type ParsedSection,
  type ParseWarning,
} from "../types";

/* ------------------------------------------------------------------ *
 * Days
 * ------------------------------------------------------------------ */

/**
 * Every way a Canadian registrar writes a weekday.
 *
 * `R` for Thursday and `U` for Sunday look like typos and are not — they are
 * standard at York and Guelph, where a single letter per day keeps `MWF` and
 * `TR` the same width. Missing them silently drops every Tuesday/Thursday
 * class at two of the five schools.
 */
const DAY_WORDS: ReadonlyArray<readonly [string, number]> = [
  ["MONDAY", 1],
  ["TUESDAY", 2],
  ["WEDNESDAY", 3],
  ["THURSDAY", 4],
  ["FRIDAY", 5],
  ["SATURDAY", 6],
  ["SUNDAY", 7],
  ["THURS", 4],
  ["TUES", 2],
  ["THUR", 4],
  ["MON", 1],
  ["TUE", 2],
  ["WED", 3],
  ["THU", 4],
  ["FRI", 5],
  ["SAT", 6],
  ["SUN", 7],
];

/** Run-on single and double letters, longest first so `TH` beats `T`. */
const DAY_LETTERS: ReadonlyArray<readonly [string, number]> = [
  ["TH", 4],
  ["TU", 2],
  ["MO", 1],
  ["WE", 3],
  ["FR", 5],
  ["SA", 6],
  ["SU", 7],
  ["M", 1],
  ["T", 2],
  ["W", 3],
  ["R", 4],
  ["F", 5],
  ["S", 6],
  ["U", 7],
];

const DAY_WORD_MAP = new Map(DAY_WORDS);

/**
 * One token to weekdays. A whole word wins outright; anything else has to be
 * consumed completely by the letter table, so `TBA` and `FALL` fail instead of
 * yielding a Tuesday.
 */
function daysFromToken(token: string): number[] | null {
  const t = token.toUpperCase().replace(/[.]/g, "");
  if (!t) return null;
  const word = DAY_WORD_MAP.get(t);
  if (word) return [word];

  const out: number[] = [];
  let i = 0;
  outer: while (i < t.length) {
    for (const [letters, weekday] of DAY_LETTERS) {
      if (t.startsWith(letters, i)) {
        if (!out.includes(weekday)) out.push(weekday);
        i += letters.length;
        continue outer;
      }
    }
    return null;
  }
  return out.length ? out : null;
}

/** `Mon, Wed & Fri` / `MWF` / `Tuesday and Thursday` → [1,3,5] / [2,4]. */
export function parseDayList(raw: string): number[] | null {
  const cleaned = raw
    .toUpperCase()
    .replace(/\bAND\b|\bET\b/g, " ")
    .replace(/[,&/+;]/g, " ")
    .trim();
  if (!cleaned) return null;

  const out: number[] = [];
  for (const token of cleaned.split(/\s+/)) {
    const days = daysFromToken(token);
    if (!days) return null;
    for (const day of days) if (!out.includes(day)) out.push(day);
  }
  return out.length ? out.sort((a, b) => a - b) : null;
}

/**
 * The weekdays sitting immediately before a time on a line.
 *
 * Read right to left from the text preceding the range and stop at the first
 * token that is not a day, which is what makes `LECT 01 Mon Wed` yield Monday
 * and Wednesday rather than choking on `LECT` or, worse, reading `01` as
 * something. A word that happens to tokenize as days (`SAT`, `M`) can only be
 * picked up if it is adjacent to the time, which is where a timetable puts it.
 */
function trailingDays(before: string): number[] | null {
  const tokens = before
    .toUpperCase()
    .replace(/\bAND\b/g, " ")
    .replace(/[,&/+;]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const collected: number[] = [];
  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    const days = daysFromToken(tokens[i]);
    if (!days) break;
    for (const day of days) if (!collected.includes(day)) collected.push(day);
  }
  return collected.length ? collected.sort((a, b) => a - b) : null;
}

/** The mirror of `trailingDays`, for portals that print `10:30-11:20 on Mon`. */
function leadingDays(after: string): number[] | null {
  const tokens = after
    .toUpperCase()
    .replace(/\bON\b|\bAND\b/g, " ")
    .replace(/[,&/+;]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const collected: number[] = [];
  for (const token of tokens) {
    const days = daysFromToken(token);
    if (!days) break;
    for (const day of days) if (!collected.includes(day)) collected.push(day);
  }
  return collected.length ? collected.sort((a, b) => a - b) : null;
}

/* ------------------------------------------------------------------ *
 * Times
 * ------------------------------------------------------------------ */

interface Clock {
  minutes: number;
  meridiem: "am" | "pm" | null;
  /** Whether the portal printed minutes. A bare `10` is weaker evidence. */
  explicit: boolean;
}

const CLOCK_RE = /^(\d{1,2})(?::(\d{2}))?\s*(?:([AaPp])\.?\s*[Mm]\.?)?$/;

function applyMeridiem(hour: number, minute: number, meridiem: "am" | "pm"): number {
  let h = hour;
  if (meridiem === "am") h = h === 12 ? 0 : h;
  else h = h === 12 ? 12 : h + 12;
  return h * 60 + minute;
}

function parseClock(raw: string): Clock | null {
  const m = CLOCK_RE.exec(raw.trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = m[2] === undefined ? 0 : Number(m[2]);
  if (minute > 59) return null;
  const meridiem = m[3] ? (m[3].toLowerCase() === "a" ? "am" : "pm") : null;
  const explicit = m[2] !== undefined || meridiem !== null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    return { minutes: applyMeridiem(hour, minute, meridiem), meridiem, explicit };
  }
  if (hour > 23) return null;
  return { minutes: hour * 60 + minute, meridiem: null, explicit };
}

/**
 * A start/end pair, with the missing half of a 12-hour clock inferred.
 *
 * Three cases matter and all three appear in real pastes. One side carries the
 * meridiem and the other does not (`10:30 - 11:20 AM`), so it is copied across
 * in whichever direction keeps the range ordered. Neither side carries one and
 * the range runs backwards (`11:30 - 1:20`), which can only mean the end is in
 * the afternoon. Neither side carries one and the range is ordered, which is a
 * 24-hour clock and is taken literally.
 */
export function parseTimeRange(startRaw: string, endRaw: string): { startMin: number; endMin: number } | null {
  const start = parseClock(startRaw);
  const end = parseClock(endRaw);
  if (!start || !end) return null;
  // A bare `9 - 10` is as likely to be a seat count as a class. One side has
  // to have said minutes or am/pm for this to be a time at all.
  if (!start.explicit && !end.explicit) return null;

  let startMin = start.minutes;
  let endMin = end.minutes;

  if (!start.meridiem && end.meridiem) {
    const h = Math.floor(startMin / 60);
    const mm = startMin % 60;
    if (h >= 1 && h <= 12) {
      const same = applyMeridiem(h, mm, end.meridiem);
      startMin = same <= endMin ? same : applyMeridiem(h, mm, end.meridiem === "pm" ? "am" : "pm");
    }
  } else if (start.meridiem && !end.meridiem) {
    const h = Math.floor(endMin / 60);
    const mm = endMin % 60;
    if (h >= 1 && h <= 12) {
      const same = applyMeridiem(h, mm, start.meridiem);
      endMin = same >= startMin ? same : applyMeridiem(h, mm, start.meridiem === "am" ? "pm" : "am");
    }
  } else if (!start.meridiem && !end.meridiem && endMin <= startMin && endMin < 720) {
    endMin += 720;
  }

  if (endMin <= startMin) return null;
  if (endMin > 24 * 60) return null;
  return { startMin, endMin };
}

const TIME_PART = String.raw`\d{1,2}(?::\d{2})?\s*(?:[AaPp]\.?\s*[Mm]\.?)?`;
const RANGE_RE = new RegExp(
  String.raw`(${TIME_PART})\s*(?:[-–—]|to|until|à)\s*(${TIME_PART})`,
  "g",
);

interface TimeMatch {
  startMin: number;
  endMin: number;
  /** Where the range sits on the line, so days and room can be read around it. */
  start: number;
  end: number;
}

/**
 * Every real time range on a line.
 *
 * The boundary checks are the whole reason this is not one regex: `9/8/2026 to
 * 12/4/2026` is a date range that a naive time pattern reads as `26` to `12`,
 * and a schedule full of phantom 2am meetings is worse than one with none. A
 * digit, slash or colon on either shoulder of the match disqualifies it.
 */
function timeRanges(line: string): TimeMatch[] {
  const out: TimeMatch[] = [];
  RANGE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = RANGE_RE.exec(line)) !== null) {
    const from = match.index;
    const to = from + match[0].length;
    const before = from > 0 ? line[from - 1] : "";
    const after = to < line.length ? line[to] : "";
    if (/[\d/:.]/.test(before) || /[\d/:]/.test(after)) continue;

    const range = parseTimeRange(match[1], match[2]);
    if (!range) continue;
    out.push({ ...range, start: from, end: to });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Course codes
 * ------------------------------------------------------------------ */

/**
 * Words that look like a subject code and are not.
 *
 * `ROOM 247` and `SEATS 12` have exactly the shape of a course code, and one
 * false course header swallows every meeting under it into a course that does
 * not exist. Cheap to list, and the list only has to cover words that appear
 * next to a number.
 */
const NOT_A_SUBJECT = new Set([
  "ROOM", "ROOMS", "SEAT", "SEATS", "CREDIT", "CREDITS", "UNIT", "UNITS",
  "SECTION", "SECTIONS", "TERM", "SEMESTER", "SESSION", "YEAR", "LEVEL",
  "FALL", "WINTER", "SPRING", "SUMMER", "PAGE", "TOTAL", "GRADE", "STATUS",
  "BUILDING", "CAMPUS", "COURSE", "COURSES", "CLASS", "CLASSES", "MEETING",
  "MEETINGS", "WEEK", "DAY", "DAYS", "TIME", "TIMES", "DATE", "DATES",
  "START", "END", "FROM", "UNTIL", "INSTRUCTOR", "TEACHER", "PROFESSOR",
  "ONLINE", "REMOTE", "VIRTUAL", "TBA", "TBD", "PHONE", "EMAIL", "STUDENT",
  "ENROLLED", "ENROLED", "REGISTERED", "WAITLIST", "WAITLISTED", "DROPPED",
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST",
  "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
]);

/**
 * `PSYC*1000`, `AP/ECON 1000`, `ECON 1P92`, `CS 135`.
 *
 * The faculty prefix York puts in front of everything (`AP/`, `LE/`, `SC/`) is
 * kept as part of the subject rather than stripped, because that is how a York
 * student writes and reads the code — and two faculties can offer a subject
 * with the same letters.
 */
const COURSE_CODE_RE = /^([A-Z]{2,10}(?:\/[A-Z]{2,10})?)(?:\s*\*\s*|\s+|\s*-\s*)(\d[0-9A-Z]{0,6})\b/;

/** A leading label some portals put before the code. */
const CODE_LABEL_RE = /^(?:course|class|cours)\s*[:#-]?\s*/i;

interface CourseCode {
  subject: string;
  catalog: string;
  /** What is left of the line after the code, for a title and a section. */
  rest: string;
}

function readCourseCode(text: string): CourseCode | null {
  const cleaned = text.trim().replace(/^[•*-]\s*/, "").replace(CODE_LABEL_RE, "");
  const match = COURSE_CODE_RE.exec(cleaned.toUpperCase());
  if (!match) return null;
  const subject = match[1];
  if (NOT_A_SUBJECT.has(subject) || subject.split("/").some((part) => NOT_A_SUBJECT.has(part))) {
    return null;
  }
  const catalog = match[2];
  if (!/\d/.test(catalog.slice(1)) && catalog.length < 3) return null;
  // `TH 247` and `MC 4020` are rooms with exactly the shape of `CS 135`, and
  // one room misread as a course header swallows every meeting under it into a
  // class nobody is enrolled in.
  if (readRoom(cleaned)) return null;

  return { subject, catalog, rest: cleaned.slice(match[0].length) };
}

/**
 * The second guard, which needs the whole line rather than one cell.
 *
 * A real course header carries something besides the code — a title, a section
 * number, a meeting time. Every one of these portals prints at least one of
 * them, and a stray line holding nothing but a building and a room number
 * prints none.
 */
function looksLikeCourseHeader(rest: string, cells: string[], hasTime: boolean): boolean {
  return rest.trim().length > 0 || cells.length > 1 || hasTime;
}

/* ------------------------------------------------------------------ *
 * Components, sections and rooms
 * ------------------------------------------------------------------ */

/**
 * What a portal calls a kind of class, normalised to the three or four letters
 * Honk shows on a card. Unrecognised words become `LEC` rather than being kept
 * verbatim: the component is used to group meetings into sections, so a stray
 * spelling would split one class into two.
 */
const COMPONENTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/^(lec|lect|lecture|cours)$/i, "LEC"],
  [/^(tut|tutr|tutorial)$/i, "TUT"],
  [/^(lab|labo|labs?|laboratory)$/i, "LAB"],
  [/^(sem|semr|seminar)$/i, "SEM"],
  [/^(pra|prac|practicum|prc)$/i, "PRA"],
  [/^(stu|stdo|studio)$/i, "STU"],
  [/^(fld|fldw|field|fieldwork)$/i, "FLD"],
  [/^(cln|clin|clinic|clinical)$/i, "CLN"],
  [/^(dis|disc|discussion)$/i, "DIS"],
  [/^(wks|wksp|workshop)$/i, "WKS"],
  [/^(tst|test|exam|exm)$/i, "EXM"],
  [/^(onl|onln|online|async|asynchronous)$/i, "ONL"],
  [/^(blen|blended|hybr|hybrid)$/i, "BLN"],
  [/^(prj|proj|project)$/i, "PRJ"],
  [/^(thes|thesis|diss)$/i, "THE"],
  [/^(ind|inds|independent|dirs)$/i, "IND"],
  [/^(intg|integrative|capstone)$/i, "INT"],
  [/^(demo|demonstration)$/i, "DEM"],
  [/^(rec|recit|recitation)$/i, "REC"],
];

function readComponent(token: string): string | null {
  const t = token.trim().replace(/[.:]/g, "");
  for (const [pattern, code] of COMPONENTS) {
    if (pattern.test(t)) return code;
  }
  return null;
}

/** `LECT 01` / `SEM  D2` — the component and, if it is next to it, its number. */
function readComponentAndSection(text: string): { component: string; sectionCode: string | null } | null {
  const tokens = text.trim().split(/[\s|]+/).filter(Boolean);
  for (let i = 0; i < tokens.length; i += 1) {
    const component = readComponent(tokens[i]);
    if (!component) continue;
    const next = tokens[i + 1]?.replace(/[^A-Za-z0-9]/g, "") ?? "";
    const sectionCode = /^[A-Z0-9]{1,6}$/i.test(next) && /\d|^[A-Z]$/i.test(next) ? next.toUpperCase() : null;
    return { component, sectionCode };
  }
  return null;
}

/**
 * A room code, or nothing.
 *
 * Deliberately narrow. A room is shown to friends and a wrong one sends
 * somebody to the wrong building, so anything that is not clearly a building
 * and a number is left null — the class still saves, it just has no room on
 * it, which is what the portals that print no room produce anyway.
 */
const ROOM_RE =
  /^(?:(?:room|rm|loc|location)\s*[:.]?\s*)?(?:[A-Z]{1,5}\d{0,2}[-\s]?[A-Z]?\d{1,4}[A-Z]?|(?:ONLINE|ONLN|REMOTE|WEB|VIRTUAL|ASYNC|OFF\s?CAMPUS)(?:\s*[-–—]\s*.+)?)$/i;

function readRoom(text: string): string | null {
  const trimmed = text.trim().replace(/^[,;|–—-]\s*/, "").replace(/[,;|]\s*$/, "");
  if (!trimmed || trimmed.length > 40) return null;
  if (/^tba|^tbd|^not\s|^no\s/i.test(trimmed)) return null;
  if (!ROOM_RE.test(trimmed)) return null;
  return trimmed.replace(/^(?:room|rm|loc|location)\s*[:.]?\s*/i, "").trim() || null;
}

const INSTRUCTOR_LABEL_RE = /\b(?:instructor|professor|teacher|taught\s+by|prof)\s*[:.]\s*(.+)$/i;

function readInstructor(line: string): string | null {
  const match = INSTRUCTOR_LABEL_RE.exec(line);
  if (!match) return null;
  const name = match[1].split(/[|\t]|\s{2,}/)[0].trim().replace(/[,;]$/, "");
  if (!name || name.length > 80 || /^tba|^tbd|^staff$/i.test(name)) return null;
  return name;
}

/* ------------------------------------------------------------------ *
 * Dates
 * ------------------------------------------------------------------ */

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const ISO_RANGE_RE = /(\d{4})-(\d{2})-(\d{2})\s*(?:[-–—]|to)\s*(\d{4})-(\d{2})-(\d{2})/;
const SLASH_RANGE_RE = /(\d{1,2})\/(\d{1,2})\/(\d{4})\s*(?:[-–—]|to)\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/;
const WORD_RANGE_RE =
  /([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s*(\d{4})?\s*(?:[-–—]|to)\s*([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s*(\d{4})/;

function iso(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export type DateOrder = "monthFirst" | "dayFirst";

/**
 * Which way round a portal writes `9/8/2026`.
 *
 * Decided once for the whole paste, from any range where only one reading is
 * possible — a 13 or higher in a position settles it. Guessing per row would
 * let one schedule hold two conventions, which is how a term ends up starting
 * in August for one course and September for another.
 */
export function detectDateOrder(input: string): DateOrder {
  const re = new RegExp(SLASH_RANGE_RE.source, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(input)) !== null) {
    const [, a, b, , d, e] = match;
    if (Number(a) > 12 || Number(d) > 12) return "dayFirst";
    if (Number(b) > 12 || Number(e) > 12) return "monthFirst";
  }
  return "monthFirst";
}

function readDateRange(line: string, order: DateOrder): { startDate: string; endDate: string } | null {
  const isoMatch = ISO_RANGE_RE.exec(line);
  if (isoMatch) {
    const start = iso(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
    const end = iso(Number(isoMatch[4]), Number(isoMatch[5]), Number(isoMatch[6]));
    if (start && end) return { startDate: start, endDate: end };
  }

  const slash = SLASH_RANGE_RE.exec(line);
  if (slash) {
    const [, p1, p2, y1, p3, p4, y2] = slash;
    const startMonth = order === "monthFirst" ? Number(p1) : Number(p2);
    const startDay = order === "monthFirst" ? Number(p2) : Number(p1);
    const endMonth = order === "monthFirst" ? Number(p3) : Number(p4);
    const endDay = order === "monthFirst" ? Number(p4) : Number(p3);
    const start = iso(Number(y1), startMonth, startDay);
    const end = iso(Number(y2), endMonth, endDay);
    if (start && end) return { startDate: start, endDate: end };
  }

  const words = WORD_RANGE_RE.exec(line);
  if (words) {
    const startMonth = MONTHS[words[1].slice(0, 3).toLowerCase()];
    const endMonth = MONTHS[words[4].slice(0, 3).toLowerCase()];
    const endYear = Number(words[6]);
    const startYear = words[3] ? Number(words[3]) : endYear;
    if (startMonth && endMonth) {
      const start = iso(startYear, startMonth, Number(words[2]));
      const end = iso(endYear, endMonth, Number(words[5]));
      if (start && end) return { startDate: start, endDate: end };
    }
  }

  return null;
}

/* ------------------------------------------------------------------ *
 * Noise
 * ------------------------------------------------------------------ */

/** Portal chrome. Skipped silently — a warning for these would be noise too. */
const NOISE_RE = new RegExp(
  [
    String.raw`^\s*$`,
    String.raw`^(sign\s?out|log\s?out|home|help|search|menu|back|next|print|export)\b`,
    String.raw`^(my\s+)?(schedule|timetable|courses?|enrolment|enrollment|registration)\s*$`,
    String.raw`^(seats?\s+available|waitlist(ed)?|credits?|units?|grading|academic\s+level)\b`,
    String.raw`^(planned|registered|in\s+progress|completed|approved|preferred)\s*$`,
    String.raw`^(total|subtotal)\b`,
    String.raw`^[-=_–—\s|•]+$`,
    String.raw`^\d{1,3}\s*$`,
    String.raw`^(copyright|©|powered\s+by|version)\b`,
  ].join("|"),
  "i",
);

/* ------------------------------------------------------------------ *
 * Cells
 * ------------------------------------------------------------------ */

/**
 * Copying an HTML table yields tab-separated cells; column-aligned text yields
 * runs of spaces. Either way the cells are the most reliable boundary
 * available, and where there are none the whole line is one cell.
 */
function splitCells(line: string): string[] {
  if (line.includes("\t")) return line.split("\t").map((c) => c.trim()).filter(Boolean);
  if (/\S {2,}\S/.test(line)) return line.split(/ {2,}/).map((c) => c.trim()).filter(Boolean);
  if (line.includes(" | ")) return line.split("|").map((c) => c.trim()).filter(Boolean);
  return [line.trim()];
}

/* ------------------------------------------------------------------ *
 * The parser
 * ------------------------------------------------------------------ */

interface Options {
  /** ISO date used only when the paste carries none, to name the term. */
  today?: string;
}

interface WorkingCourse {
  course: ParsedCourse;
  /** Section code from the course header, used when a row does not carry one. */
  headerSection: string | null;
  sections: Map<string, ParsedSection>;
}

export function parseGenericSchedule(input: string, options: Options = {}): ParseResult {
  const warnings: ParseWarning[] = [];
  const courses: ParsedCourse[] = [];
  /** By "SUBJ CATALOG", so a repeated course header rejoins its own course. */
  const byCode = new Map<string, WorkingCourse>();
  let current: WorkingCourse | null = null;
  /** Meetings from the line just read, waiting for a room on the next one. */
  let pending: ParsedMeeting[] = [];

  const normalised = input.replace(/\r\n?/g, "\n").replace(/ /g, " ");
  const order = detectDateOrder(normalised);
  const lines = normalised.split("\n");

  /** Meetings and dates land on a section; this finds or makes the right one. */
  const sectionFor = (
    working: WorkingCourse,
    component: string | null,
    sectionCode: string | null,
  ): ParsedSection => {
    const comp = component ?? "LEC";
    // Neither the row nor the course header carried one, so "01" is a label
    // rather than a fact. `sectionKeyFor` needs to know the difference.
    const read = sectionCode ?? working.headerSection;
    const code = read ?? "01";
    const key = `${comp}.${code}`;
    const existing = working.sections.get(key);
    if (existing) return existing;
    const section: ParsedSection = {
      classNumber: null,
      sectionCode: code.toUpperCase(),
      sectionCodeInferred: read === null,
      component: comp,
      instructor: null,
      startDate: null,
      endDate: null,
      meetings: [],
    };
    working.sections.set(key, section);
    working.course.sections.push(section);
    return section;
  };

  lines.forEach((rawLine, index) => {
    const line = rawLine.replace(/ | /g, " ").trimEnd();
    const trimmed = line.trim();
    if (!trimmed || NOISE_RE.test(trimmed)) return;

    const cells = splitCells(line);
    const times = timeRanges(line);

    /*
     * A course code at the head of the line's first cell starts a new course.
     * Portals that print the code and the meeting on one line hit this branch
     * and the meeting branch below, in that order, which is why this does not
     * `return`.
     *
     * Only the first cell, never the whole line: `LECT 01  Mon  11:30 - 13:20`
     * contains a perfectly well-formed course code — `LECT 01` — and reading
     * the line as a whole turns every meeting row at York into its own
     * imaginary course. Where a line has no cell boundaries the first cell is
     * the line, so nothing is lost.
     */
    const candidate = readCourseCode(cells[0]);
    const code =
      candidate && looksLikeCourseHeader(candidate.rest, cells, times.length > 0)
        ? candidate
        : null;
    if (code) {
      const { section, title } = splitTitle(code.rest, cells);

      /*
       * A course code seen twice is the same course, not a second one.
       *
       * York prints each required component of a course as its own block with
       * the course code repeated above it — a lecture block and a tutorial
       * block, both headed `AP/ECON 1000`. Starting a fresh course on the
       * second header produced two entries for one course, whose sections then
       * collided on identity and got the whole paste rejected with "that
       * schedule lists the same class twice". Reported by a Schulich student
       * whose winter term would not save; his fall term, which happened to
       * have one component per course, was fine.
       */
      const existing = byCode.get(`${code.subject} ${code.catalog}`);
      if (existing) {
        // A later block may carry a title or a status the first one lacked.
        existing.course.title = existing.course.title ?? title;
        if (existing.course.status === "unknown") {
          existing.course.status = statusIn(trimmed) ?? "unknown";
        }
        // Its own section code, though — this block describes a different part.
        existing.headerSection = section ?? existing.headerSection;
        current = existing;
      } else {
        const course: ParsedCourse = {
          subject: code.subject,
          catalog: code.catalog,
          title,
          status: statusIn(trimmed) ?? "unknown",
          sections: [],
        };
        current = { course, headerSection: section, sections: new Map() };
        byCode.set(`${code.subject} ${code.catalog}`, current);
        courses.push(course);
      }
      // A room can only ever belong to the course it was printed under.
      pending = [];
    }

    if (!current) {
      if (times.length) {
        warnings.push({
          line: index + 1,
          text: trimmed.slice(0, 80),
          reason: "A class time with no course code above it",
        });
      }
      return;
    }

    const status = statusIn(trimmed);
    if (status && !code) current.course.status = status;

    const componentInfo = readComponentAndSection(times.length ? line.slice(0, times[0].start) : line);
    const dates = readDateRange(line, order);
    const instructor = readInstructor(line);

    if (!times.length) {
      /*
       * Student Planning prints the room on its own line under the meeting it
       * belongs to, so a line that is nothing but a room backfills the
       * meetings just read. Bounded deliberately: only the immediately
       * preceding line's meetings, and only where the room is still null.
       */
      const orphanRoom = readRoom(trimmed);
      if (orphanRoom && pending.length) {
        for (const meeting of pending) {
          if (meeting.location === null) meeting.location = orphanRoom;
        }
        pending = [];
        return;
      }

      // A line with no time can still carry the section's dates or teacher.
      if (dates || instructor) {
        const section = sectionFor(current, componentInfo?.component ?? null, componentInfo?.sectionCode ?? null);
        if (dates && !section.startDate) {
          section.startDate = dates.startDate;
          section.endDate = dates.endDate;
        }
        if (instructor && !section.instructor) section.instructor = instructor;
      }
      return;
    }

    pending = [];
    for (const time of times) {
      const before = line.slice(0, time.start);
      const after = line.slice(time.end);
      const days = trailingDays(before) ?? leadingDays(after);
      const section = sectionFor(
        current,
        componentInfo?.component ?? null,
        componentInfo?.sectionCode ?? null,
      );

      if (dates && !section.startDate) {
        section.startDate = dates.startDate;
        section.endDate = dates.endDate;
      }
      if (instructor && !section.instructor) section.instructor = instructor;

      if (!days) {
        warnings.push({
          line: index + 1,
          text: trimmed.slice(0, 80),
          reason: "Found a time here but could not tell which days it runs",
        });
        continue;
      }

      const location = roomNear(line, time, cells);
      for (const weekday of days) {
        const meeting: ParsedMeeting = {
          weekday,
          startMin: time.startMin,
          endMin: time.endMin,
          location,
        };
        const duplicate = section.meetings.some(
          (m) => m.weekday === meeting.weekday && m.startMin === meeting.startMin && m.endMin === meeting.endMin,
        );
        if (!duplicate) {
          section.meetings.push(meeting);
          pending.push(meeting);
        }
      }
    }
  });

  const kept: ParsedCourse[] = [];
  for (const course of courses) {
    if (course.status === "dropped") {
      warnings.push({
        line: 0,
        text: `${course.subject} ${course.catalog}`,
        reason: "Marked dropped, so it was left out",
      });
      continue;
    }
    // A course with no section at all was a false header, not a class.
    if (!course.sections.length) continue;
    for (const section of course.sections) {
      section.meetings.sort((a, b) => a.weekday - b.weekday || a.startMin - b.startMin);
    }
    kept.push(course);
  }

  const termCode = deriveTermCode(kept) ?? (options.today ? termCodeForPasteDate(options.today) : null);
  return { courses: kept, warnings, termCode };
}

/* ------------------------------------------------------------------ *
 * Header helpers
 * ------------------------------------------------------------------ */

const STATUS_RE = /\b(enrolled|enroled|registered|dropped|withdrawn|waitlisted|waiting\s?list)\b/i;

function statusIn(line: string): ParsedCourse["status"] | null {
  const match = STATUS_RE.exec(line);
  if (!match) return null;
  const word = match[1].toLowerCase().replace(/\s+/g, "");
  if (word.startsWith("drop") || word.startsWith("withdraw")) return "dropped";
  if (word.startsWith("wait")) return "waitlisted";
  return "enrolled";
}

/** York prints a credit weight next to the code; it is not part of the title. */
const CREDIT_RE = /^\d\.\d{2}$/;

/**
 * Pull a section code and a title out of what follows a course code.
 *
 * `*01: Principles of Behaviour` → section `01`, title the rest.
 * `3.00 A  Introduction to Microeconomics` → section `A`, credit weight dropped.
 */
function splitTitle(rest: string, cells: string[]): { section: string | null; title: string | null } {
  let text = rest.trim();
  let section: string | null = null;

  // A starred or dashed section number immediately after the catalog.
  const starred = /^[*\-]\s*([A-Z0-9]{1,4})\b/i.exec(text);
  if (starred) {
    section = starred[1].toUpperCase();
    text = text.slice(starred[0].length);
  }

  text = text.replace(/^[\s:–—-]+/, "");

  // Then any number of leading tokens that are section-ish rather than words.
  for (;;) {
    const token = /^(\S+)\s*/.exec(text);
    if (!token) break;
    const word = token[1].replace(/[,:]$/, "");
    if (CREDIT_RE.test(word)) {
      text = text.slice(token[0].length);
      continue;
    }
    if (!section && /^[A-Z]\d?$|^\d{1,3}[A-Z]?$/.test(word) && word.length <= 3) {
      section = word.toUpperCase();
      text = text.slice(token[0].length);
      continue;
    }
    break;
  }

  text = text.replace(/^[\s:–—-]+/, "").split(/\t|\s{2,}|\|/)[0].trim();

  // The title often sits in a later cell rather than after the code, with a
  // section label and a component in between. Walk the cells and take the
  // first that reads like the name of a course rather than metadata.
  for (const cell of cells.slice(1)) {
    const labelled = SECTION_LABEL_RE.exec(cell.trim());
    if (labelled) {
      section = section ?? labelled[1].toUpperCase();
      continue;
    }
    if (text) continue;
    const candidate = cell.trim();
    if (candidate.length <= 3 || candidate.length > 120) continue;
    if (!/[a-z]/.test(candidate)) continue;
    if (timeRanges(candidate).length || readRoom(candidate) || readComponent(candidate)) continue;
    if (parseDayList(candidate)) continue;
    if (INSTRUCTOR_LABEL_RE.test(candidate) || /^\d/.test(candidate)) continue;
    text = candidate;
  }

  const title = text && text.length <= 120 ? text : null;
  return { section, title };
}

/** `Section A`, `Sect 01` — a label, and the code hiding inside it. */
const SECTION_LABEL_RE = /^(?:section|sect|sec|sctn)\s*[:.]?\s*([A-Z0-9]{1,4})$/i;

/**
 * The room for one meeting: whatever follows the time on the same line, or the
 * cell after the one the time is in.
 */
function roomNear(line: string, time: TimeMatch, cells: string[]): string | null {
  const direct = readRoom(line.slice(time.end));
  if (direct) return direct;

  // Only cells to the right of the time can be its room. Looking leftward
  // finds `LECT 01`, which has the shape of a building and a room number and
  // is neither.
  const timeCell = cells.findIndex((cell) => timeRanges(cell).length > 0);
  const after = timeCell === -1 ? [] : cells.slice(timeCell + 1);
  for (const cell of after) {
    const room = readRoom(cell);
    if (room) return room;
  }
  return null;
}
