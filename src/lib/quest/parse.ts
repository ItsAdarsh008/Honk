/**
 * Quest class-schedule parser.
 *
 * Input is whatever lands on the clipboard after Ctrl+A / Ctrl+C on Quest's
 * "My Class Schedule" List View. This is a line-oriented state machine rather
 * than one mega-regex: course headers switch state, rows accumulate into the
 * current course, and a row that cannot be read is reported as a warning
 * instead of being silently dropped.
 *
 * Pure. No I/O, no imports. It runs in the browser so the raw paste never has
 * to reach the server before the user has seen what was extracted.
 */

export interface ParsedMeeting {
  /** 1 = Monday ... 7 = Sunday */
  weekday: number;
  /** Minutes from midnight, local campus time. */
  startMin: number;
  endMin: number;
  /** Null when Quest said TBA. */
  location: string | null;
}

export type CourseStatus = "enrolled" | "dropped" | "waitlisted" | "unknown";

export interface ParsedSection {
  classNumber: number;
  sectionCode: string;
  component: string;
  instructor: string | null;
  /** ISO yyyy-mm-dd, or null when Quest said TBA. */
  startDate: string | null;
  endDate: string | null;
  meetings: ParsedMeeting[];
}

export interface ParsedCourse {
  subject: string;
  catalog: string;
  title: string | null;
  status: CourseStatus;
  sections: ParsedSection[];
}

export interface ParseWarning {
  /** 1-indexed line number in the original paste; 0 for course-level notes. */
  line: number;
  text: string;
  reason: string;
}

export interface ParseResult {
  courses: ParsedCourse[];
  warnings: ParseWarning[];
  /** Waterloo term code derived from section dates, e.g. "1269". */
  termCode: string | null;
}

/* ------------------------------------------------------------------ *
 * Days
 * ------------------------------------------------------------------ */

/** Two-letter tokens first: `Th` must beat `T`, `Su` must beat `S`. */
const DAY_TOKENS: ReadonlyArray<readonly [string, number]> = [
  ["Su", 7],
  ["Th", 4],
  ["Sa", 6],
  ["Tu", 2],
  ["Mo", 1],
  ["We", 3],
  ["Fr", 5],
  ["M", 1],
  ["T", 2],
  ["W", 3],
  ["F", 5],
  ["S", 6],
];

/**
 * Tokenize a run-on day string (`MWF`, `TTh`, `MThF`) into weekday numbers.
 * Returns null if any character cannot be consumed, so callers can fall back
 * rather than inventing days.
 */
export function parseDays(raw: string): number[] | null {
  const s = raw.trim();
  if (!s) return null;
  const out: number[] = [];
  let i = 0;
  outer: while (i < s.length) {
    const ch = s[i];
    if (ch === " " || ch === "," || ch === "/" || ch === "&") {
      i += 1;
      continue;
    }
    for (const [token, weekday] of DAY_TOKENS) {
      if (s.startsWith(token, i)) {
        if (!out.includes(weekday)) out.push(weekday);
        i += token.length;
        continue outer;
      }
    }
    return null;
  }
  return out.length ? out.sort((a, b) => a - b) : null;
}

/* ------------------------------------------------------------------ *
 * Times
 * ------------------------------------------------------------------ */

const CLOCK_RE = /^(\d{1,2}):(\d{2})\s*(?:([AaPp])\.?\s*[Mm]\.?)?$/;

function applyMeridiem(hour: number, minute: number, meridiem: "am" | "pm"): number {
  let h = hour;
  if (meridiem === "am") h = h === 12 ? 0 : h;
  else h = h === 12 ? 12 : h + 12;
  return h * 60 + minute;
}

function parseClock(raw: string): { minutes: number; meridiem: "am" | "pm" | null } | null {
  const m = CLOCK_RE.exec(raw.trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (minute > 59) return null;
  const meridiem = m[3] ? (m[3].toLowerCase() === "a" ? "am" : "pm") : null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    return { minutes: applyMeridiem(hour, minute, meridiem), meridiem };
  }
  if (hour > 23) return null;
  return { minutes: hour * 60 + minute, meridiem: null };
}

/**
 * Parse a start/end pair. Quest honours a per-user 12h/24h setting, so both
 * forms appear in the wild; presence of AM/PM decides which.
 */
export function parseTimeRange(
  startRaw: string,
  endRaw: string,
): { startMin: number; endMin: number } | null {
  const start = parseClock(startRaw);
  const end = parseClock(endRaw);
  if (!start || !end) return null;

  let startMin = start.minutes;
  let endMin = end.minutes;

  // Only one side carries a meridiem: infer the other so the range stays ordered.
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
  }

  if (endMin <= startMin) return null;
  return { startMin, endMin };
}

/* ------------------------------------------------------------------ *
 * Line shapes
 * ------------------------------------------------------------------ */

const COURSE_HEADER_RE = /^([A-Za-z]{2,8})\s+(\d{1,3}[A-Za-z]{0,2})\s*[-–—]\s*(.+?)\s*$/;
const CLASS_NBR_RE = /^\d{4,5}$/;
const DATE_RANGE_RE =
  /(\d{1,2})\/(\d{1,2})\/(\d{4})\s*[-–—]\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/;
const SINGLE_DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const TIME_PART = String.raw`\d{1,2}:\d{2}\s*(?:[AaPp]\.?\s*[Mm]\.?)?`;
const DAYS_TIMES_FULL_RE = new RegExp(
  String.raw`^([A-Za-z]{1,12})\s+(${TIME_PART})\s*(?:[-–—]|to)\s*(${TIME_PART})$`,
);
const TIME_ONLY_RE = new RegExp(
  String.raw`^(${TIME_PART})\s*(?:[-–—]|to)\s*(${TIME_PART})$`,
);
/**
 * A building code and a number (`MC 4020`, `E7 2317`, `EV3 1408`), or one of
 * the ways Quest says "not a room". Real pastes carry `ONLN - Online`, so the
 * online forms allow a trailing description — without it that cell fails the
 * room test and spills into the instructor field.
 */
const ROOM_RE =
  /^(?:[A-Z]{1,4}\d{0,2}\s+\d{1,4}[A-Z]?|(?:ONLN|ONLINE|REMOTE|WEB|VIRTUAL|OFF\s?CAMPUS)(?:\s*[-–—]\s*.+)?)$/i;
const STATUS_RE = /^(Enrolled|Dropped|Waitlisted|Waiting|Wait\s?List(?:ed)?)\b/i;

/** The List View column headings, used as record boundaries when reflowing. */
const COLUMN_HEADING_RE =
  /^(class\s*nbr|section|component|days?\s*&?\s*times?|room|instructor|start\/end\s*date|status|units|grading|grade|deadlines)\b/i;

/** Chrome, column headings and other copy noise. Skipped without a warning. */
const NOISE_RE = new RegExp(
  [
    String.raw`^\s*$`,
    String.raw`^(class\s*nbr|section|component|days?\s*&?\s*times?|room|instructor|start\/end\s*date)\b`,
    String.raw`^(status|units|grading|grade|deadlines|academic\s*calendar\s*deadlines)\b`,
    String.raw`^(my\s+class\s+schedule|class\s+schedule|weekly\s+calendar\s+view|list\s+view)\b`,
    String.raw`^(search|plan|enroll|my\s+academics|shopping\s+cart)\b`,
    String.raw`^(select\s+display\s+option|show\s+enrolled\s+classes|show\s+dropped\s+classes)\b`,
    String.raw`^(undergraduate|graduate|university\s+of\s+waterloo|go\s+to\s+top)\b`,
    String.raw`^(fall|winter|spring)\s+\d{4}\b.*\|`,
    String.raw`^(printer\s+friendly|filter|view\s+all|first|last)\b`,
    String.raw`^[-=_–—\s|]+$`,
    String.raw`^\d{1,3}\s*$`,
    String.raw`^(numeric\s+grading|credit\/no\s+credit|audit)\b`,
  ].join("|"),
  "i",
);

/* ------------------------------------------------------------------ *
 * Cell splitting
 * ------------------------------------------------------------------ */

/**
 * Copying an HTML table out of a browser usually yields tab-separated cells,
 * which is by far the most reliable signal. Column-aligned text (runs of two
 * or more spaces) is the fallback. A single-spaced line gets no cells and is
 * parsed positionally instead.
 */
function splitCells(line: string): string[] | null {
  if (line.includes("\t")) {
    return line
      .split("\t")
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
  }
  if (/\S {2,}\S/.test(line)) {
    return line
      .split(/ {2,}/)
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
  }
  return null;
}

interface RawRow {
  classNumber: number;
  sectionCode: string;
  component: string;
  daysTimes: string | null;
  room: string | null;
  instructor: string | null;
  dates: string | null;
}

function isDaysTimes(cell: string): boolean {
  const m = DAYS_TIMES_FULL_RE.exec(cell.trim());
  if (!m) return false;
  return parseDays(m[1]) !== null && parseTimeRange(m[2], m[3]) !== null;
}

function isTba(cell: string): boolean {
  return /^tba$/i.test(cell.trim());
}

function assignFromCells(cells: string[]): RawRow | null {
  const idx = cells.findIndex((c) => CLASS_NBR_RE.test(c));
  if (idx === -1) return null;
  const classNumber = Number(cells[idx]);
  const sectionCode = cells[idx + 1];
  const component = cells[idx + 2];
  if (!sectionCode || !component) return null;
  if (!/^[A-Za-z0-9]{1,6}$/.test(sectionCode)) return null;
  if (!/^[A-Za-z]{2,4}$/.test(component)) return null;

  let rest = cells.slice(idx + 3);

  // The date range lives at the end.
  let dates: string | null = null;
  const dateIdx = rest.findIndex((c) => DATE_RANGE_RE.test(c) || SINGLE_DATE_RE.test(c));
  if (dateIdx !== -1) {
    if (
      SINGLE_DATE_RE.test(rest[dateIdx]) &&
      rest[dateIdx + 1] &&
      SINGLE_DATE_RE.test(rest[dateIdx + 1])
    ) {
      // A range the copy split across two cells.
      dates = `${rest[dateIdx]} - ${rest[dateIdx + 1]}`;
    } else {
      dates = rest[dateIdx];
    }
    rest = rest.slice(0, dateIdx);
  }

  // Days and times occasionally arrive as two cells.
  const merged: string[] = [];
  for (let i = 0; i < rest.length; i += 1) {
    const cur = rest[i];
    const next = rest[i + 1];
    if (next && parseDays(cur) && TIME_ONLY_RE.test(next)) {
      merged.push(`${cur} ${next}`);
      i += 1;
    } else {
      merged.push(cur);
    }
  }

  // In-order greedy fill: days & times, then room, then instructor.
  let daysTimes: string | null = null;
  let room: string | null = null;
  const instructorParts: string[] = [];
  let slot = 0;
  for (const cell of merged) {
    while (slot < 3) {
      if (slot === 0 && (isDaysTimes(cell) || isTba(cell))) {
        daysTimes = cell;
        slot = 1;
        break;
      }
      if (slot === 1 && (ROOM_RE.test(cell) || isTba(cell))) {
        room = cell;
        slot = 2;
        break;
      }
      if (slot === 2) {
        instructorParts.push(cell);
        break;
      }
      slot += 1;
    }
  }

  return {
    classNumber,
    sectionCode,
    component: component.toUpperCase(),
    daysTimes,
    room,
    instructor: instructorParts.length ? instructorParts.join(" ") : null,
    dates,
  };
}

/* ------------------------------------------------------------------ *
 * Vertical pastes
 * ------------------------------------------------------------------ */

/**
 * Quest's List View copies one cell per line.
 *
 * `SPEC.md`'s example was a tab-separated table, which is what you get by
 * copying a table element. But Quest builds List View out of stacked divs, so
 * selecting the whole page — which is what the instructions on the paste screen
 * tell you to do — puts every cell on its own line. A class row arrives as
 * seven consecutive lines and nothing downstream recognises any of them.
 *
 * Rather than teach every rule below about a fourth layout, the record is
 * stitched back into one tab-separated line and the existing parser takes over
 * unchanged. Horizontal pastes never contain a bare class number on its own
 * line, so they route around this untouched.
 */
function reflowVerticalRows(lines: string[]): string[] {
  if (!lines.some((l) => CLASS_NBR_RE.test(l.trim()))) return lines;

  /**
   * Where a record stops. Blank counts: Quest never splits a cell across a
   * blank line, so stopping there turns a missing column into a short row the
   * parser warns about, rather than one silently filled from the next record.
   */
  const isBoundary = (raw: string): boolean => {
    const t = raw.trim();
    if (!t) return true;
    return (
      CLASS_NBR_RE.test(t) ||
      COURSE_HEADER_RE.test(t) ||
      COLUMN_HEADING_RE.test(t) ||
      STATUS_RE.test(t)
    );
  };

  const take = (from: number, max: number): string[] => {
    const cells: string[] = [];
    let j = from;
    while (j < lines.length && cells.length < max && !isBoundary(lines[j])) {
      cells.push(lines[j].trim());
      j += 1;
    }
    return cells;
  };

  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i].trim();

    // Class Nbr, Section, Component, Days & Times, Room, Instructor, Dates.
    if (CLASS_NBR_RE.test(trimmed)) {
      const cells = take(i + 1, 6);
      out.push([trimmed, ...cells].join("\t"));
      i += 1 + cells.length;
      continue;
    }

    // A second meeting for the section above: no class number, so the record
    // starts at the Days & Times column and runs three cells shorter.
    if (isDaysTimes(trimmed)) {
      const cells = take(i + 1, 3);
      out.push([trimmed, ...cells].join("\t"));
      i += 1 + cells.length;
      continue;
    }

    out.push(lines[i]);
    i += 1;
  }

  return out;
}

const FLAT_ROW_RE = /^\s*(\d{4,5})\s+([A-Za-z0-9]{1,6})\s+([A-Za-z]{2,4})\s+(.*)$/;

function assignFromFlatLine(line: string): RawRow | null {
  const m = FLAT_ROW_RE.exec(line);
  if (!m) return null;
  const [, nbr, sectionCode, component, tailRaw] = m;

  let tail = tailRaw.trim();
  let dates: string | null = null;
  const dateMatch = DATE_RANGE_RE.exec(tail);
  if (dateMatch) {
    dates = dateMatch[0];
    tail = tail.slice(0, dateMatch.index).trim();
  }

  let daysTimes: string | null = null;
  let room: string | null = null;

  const dtPrefix = new RegExp(
    String.raw`^(TBA|[A-Za-z]{1,12}\s+${TIME_PART}\s*(?:[-–—]|to)\s*${TIME_PART})(?=\s|$)`,
    "i",
  );
  const dtMatch = dtPrefix.exec(tail);
  if (dtMatch) {
    daysTimes = dtMatch[1];
    tail = tail.slice(dtMatch[0].length).trim();
  }

  const roomPrefix = /^(TBA|ONLINE|REMOTE|[A-Z]{1,4}\d{0,2}\s+\d{1,4}[A-Z]?)(?=\s|$)/i;
  const roomMatch = roomPrefix.exec(tail);
  if (roomMatch) {
    room = roomMatch[1];
    tail = tail.slice(roomMatch[0].length).trim();
  }

  return {
    classNumber: Number(nbr),
    sectionCode,
    component: component.toUpperCase(),
    daysTimes,
    room,
    instructor: tail.length ? tail : null,
    dates,
  };
}

function parseRow(line: string): RawRow | null {
  const cells = splitCells(line);
  if (cells && cells.length >= 3) {
    const fromCells = assignFromCells(cells);
    if (fromCells) return fromCells;
  }
  return assignFromFlatLine(line);
}

/* ------------------------------------------------------------------ *
 * Field normalisation
 * ------------------------------------------------------------------ */

/**
 * What Quest writes when nobody is assigned yet. Real pastes say
 * "To be Announced" in the Instructor column, which was being stored and shown
 * as a person's name.
 *
 * Only for normalising a value already placed in a column. `isTba` stays narrow
 * because it decides *which* column a cell belongs to, and a broad match there
 * would let an unassigned instructor be mistaken for the room.
 */
const UNASSIGNED_RE =
  /^(?:tba|tbd|to\s+be\s+announced|to\s+be\s+determined|staff|not\s+assigned)$/i;

function normaliseTba(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (!trimmed || UNASSIGNED_RE.test(trimmed)) return null;
  return trimmed;
}

function toIso(month: string, day: string, year: string): string {
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function daysBetween(startIso: string, endIso: string): number {
  return (Date.parse(endIso) - Date.parse(startIso)) / 86_400_000;
}

/** A term runs a few months. Anything outside this is the wrong reading. */
function plausibleTerm(startIso: string, endIso: string): boolean {
  const span = daysBetween(startIso, endIso);
  return span >= 0 && span <= 250;
}

type DateOrder = "monthFirst" | "dayFirst";
type DateRange = { startDate: string; endDate: string };

function readings(m: RegExpMatchArray): Record<DateOrder, DateRange> {
  return {
    monthFirst: { startDate: toIso(m[1], m[2], m[3]), endDate: toIso(m[4], m[5], m[6]) },
    dayFirst: { startDate: toIso(m[2], m[1], m[3]), endDate: toIso(m[5], m[4], m[6]) },
  };
}

/** The order this one range forces, or null when both readings hold up. */
function decideOrder(m: RegExpMatchArray): DateOrder | null {
  const monthPossible = Number(m[1]) <= 12 && Number(m[4]) <= 12;
  const dayPossible = Number(m[2]) <= 12 && Number(m[5]) <= 12;
  // A component above 12 can only be a day, which decides it outright.
  if (monthPossible && !dayPossible) return "monthFirst";
  if (dayPossible && !monthPossible) return "dayFirst";
  if (!monthPossible && !dayPossible) return null;

  // Both readable as dates: prefer the one that describes an actual term.
  const { monthFirst, dayFirst } = readings(m);
  const monthOk = plausibleTerm(monthFirst.startDate, monthFirst.endDate);
  const dayOk = plausibleTerm(dayFirst.startDate, dayFirst.endDate);
  if (monthOk && !dayOk) return "monthFirst";
  if (dayOk && !monthOk) return "dayFirst";
  return null;
}

/**
 * The reading the whole paste agrees on.
 *
 * Term ranges settle themselves — `09/09/2026 - 08/12/2026` is only ordered
 * read day-first. Single-day rows do not: a midterm on `08/10/2026` is equally
 * readable as 8 October and 10 August. Deciding those in isolation and falling
 * back to MM/DD put a real Thursday test in August. Every range in the paste
 * comes from one account with one date setting, so the ones that settle
 * themselves settle the rest.
 */
function detectDateOrder(input: string): DateOrder | null {
  let monthFirst = 0;
  let dayFirst = 0;
  for (const m of input.matchAll(new RegExp(DATE_RANGE_RE.source, "g"))) {
    const verdict = decideOrder(m);
    if (verdict === "monthFirst") monthFirst += 1;
    else if (verdict === "dayFirst") dayFirst += 1;
  }
  if (monthFirst === dayFirst) return null;
  return monthFirst > dayFirst ? "monthFirst" : "dayFirst";
}

/**
 * Read a Quest date range.
 *
 * Quest renders dates in the account's own format, so `09/08/2026` is
 * 8 September to a student set to MM/DD and 9 August to one set to DD/MM.
 * Guessing wrong is not a cosmetic error: the term code is derived from these
 * dates, and sections are keyed on (term_code, class_number), so a misread
 * date would file two students in the same lecture under different terms and
 * they would never match.
 *
 * `fallback` is what the rest of the paste voted for; MM/DD, Quest's default,
 * only applies when nothing in the paste settles it either.
 */
function parseDates(
  raw: string | null,
  fallback: DateOrder = "monthFirst",
): { startDate: string | null; endDate: string | null } {
  if (!raw) return { startDate: null, endDate: null };
  const m = DATE_RANGE_RE.exec(raw);
  if (!m) return { startDate: null, endDate: null };
  return readings(m)[decideOrder(m) ?? fallback];
}

function meetingsFrom(daysTimes: string | null, room: string | null): ParsedMeeting[] {
  const value = normaliseTba(daysTimes);
  if (!value) return [];
  const m = DAYS_TIMES_FULL_RE.exec(value.trim());
  if (!m) return [];
  const days = parseDays(m[1]);
  if (!days) return [];
  const range = parseTimeRange(m[2], m[3]);
  if (!range) return [];
  const location = normaliseTba(room);
  return days.map((weekday) => ({
    weekday,
    startMin: range.startMin,
    endMin: range.endMin,
    location,
  }));
}

/* ------------------------------------------------------------------ *
 * Term code
 * ------------------------------------------------------------------ */

/**
 * Waterloo term codes are `1` + two-digit year + term digit
 * (1 = Winter, 5 = Spring, 9 = Fall). Fall 2026 is 1269.
 */
export function termCodeForDate(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  const digit = month >= 9 ? 9 : month >= 5 ? 5 : 1;
  const century = Math.floor(year / 100) - 19;
  return `${century}${String(year % 100).padStart(2, "0")}${digit}`;
}

/** Derive the term from the earliest section start date in the paste. */
export function deriveTermCode(courses: ParsedCourse[]): string | null {
  const starts = courses
    .flatMap((c) => c.sections)
    .map((s) => s.startDate)
    .filter((d): d is string => Boolean(d))
    .sort();
  if (!starts.length) return null;
  return termCodeForDate(starts[0]);
}

/* ------------------------------------------------------------------ *
 * The state machine
 * ------------------------------------------------------------------ */

export function parseQuestSchedule(input: string): ParseResult {
  const warnings: ParseWarning[] = [];
  const courses: ParsedCourse[] = [];
  let current: ParsedCourse | null = null;
  let lastSection: ParsedSection | null = null;

  // Non-breaking spaces come through the whole page copy in bulk, and they
  // have to go before anything measures a line's shape.
  const normalised = input.replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ");
  const dateOrder = detectDateOrder(normalised) ?? "monthFirst";
  const lines = reflowVerticalRows(normalised.split("\n"));


  lines.forEach((rawLine, index) => {
    const lineNo = index + 1;
    const line = rawLine.replace(/ /g, " ").trimEnd();
    const trimmed = line.trim();

    if (!trimmed) return;

    // Course header switches state.
    const header = COURSE_HEADER_RE.exec(trimmed);
    if (header) {
      current = {
        subject: header[1].toUpperCase(),
        catalog: header[2].toUpperCase(),
        title: header[3].trim() || null,
        status: "unknown",
        sections: [],
      };
      lastSection = null;
      courses.push(current);
      return;
    }

    // Status belongs to the course block it sits in.
    const status = STATUS_RE.exec(trimmed);
    if (status && current) {
      const word = status[1].toLowerCase().replace(/\s+/g, "");
      current.status = word.startsWith("drop")
        ? "dropped"
        : word.startsWith("wait")
          ? "waitlisted"
          : "enrolled";
      return;
    }

    if (NOISE_RE.test(trimmed)) return;

    // A continuation row: same section, a second meeting pattern.
    if (current && lastSection && !/^\s*\d{4,5}\b/.test(trimmed)) {
      const cells = splitCells(line);
      const candidate = cells && cells.length ? cells[0] : trimmed;
      if (isDaysTimes(candidate)) {
        const roomCell = cells && cells.length > 1 ? cells[1] : null;
        const extra = meetingsFrom(candidate, roomCell);
        if (extra.length) {
          lastSection.meetings.push(...extra);
          const extraDates = parseDates(cells ? cells.join(" ") : trimmed, dateOrder);
          if (extraDates.startDate && !lastSection.startDate) {
            lastSection.startDate = extraDates.startDate;
            lastSection.endDate = extraDates.endDate;
          }
          return;
        }
      }
    }

    const row = parseRow(line);
    if (!row) {
      // Only complain about lines that were plainly trying to be data.
      if (/^\s*\d{4,5}\b/.test(trimmed)) {
        warnings.push({
          line: lineNo,
          text: trimmed,
          reason: "Could not read this as a class row",
        });
      }
      return;
    }

    if (!current) {
      warnings.push({
        line: lineNo,
        text: trimmed,
        reason: "Class row with no course heading above it",
      });
      return;
    }

    const dates = parseDates(row.dates, dateOrder);
    const existing = current.sections.find((s) => s.classNumber === row.classNumber);
    const meetings = meetingsFrom(row.daysTimes, row.room);

    if (existing) {
      existing.meetings.push(...meetings);
      if (!existing.startDate && dates.startDate) {
        existing.startDate = dates.startDate;
        existing.endDate = dates.endDate;
      }
      lastSection = existing;
      return;
    }

    const section: ParsedSection = {
      classNumber: row.classNumber,
      sectionCode: row.sectionCode.toUpperCase(),
      component: row.component,
      instructor: normaliseTba(row.instructor),
      startDate: dates.startDate,
      endDate: dates.endDate,
      meetings,
    };
    current.sections.push(section);
    lastSection = section;
  });

  const kept: ParsedCourse[] = [];
  for (const course of courses) {
    if (course.status === "dropped") {
      warnings.push({
        line: 0,
        text: `${course.subject} ${course.catalog}`,
        reason: "Marked dropped in Quest, so it was left out",
      });
      continue;
    }
    if (course.sections.length === 0) continue;
    kept.push(course);
  }

  return { courses: kept, warnings, termCode: deriveTermCode(kept) };
}
