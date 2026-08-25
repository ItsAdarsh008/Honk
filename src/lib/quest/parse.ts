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
const ROOM_RE = /^(?:[A-Z]{1,4}\d{0,2}\s+\d{1,4}[A-Z]?|ONLINE|REMOTE|OFF\s+CAMPUS)$/i;
const STATUS_RE = /^(Enrolled|Dropped|Waitlisted|Waiting|Wait\s?List(?:ed)?)\b/i;

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

function normaliseTba(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (!trimmed || isTba(trimmed)) return null;
  return trimmed;
}

function toIso(month: string, day: string, year: string): string {
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function parseDates(raw: string | null): { startDate: string | null; endDate: string | null } {
  if (!raw) return { startDate: null, endDate: null };
  const m = DATE_RANGE_RE.exec(raw);
  if (!m) return { startDate: null, endDate: null };
  return {
    startDate: toIso(m[1], m[2], m[3]),
    endDate: toIso(m[4], m[5], m[6]),
  };
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

  const lines = input.replace(/\r\n?/g, "\n").split("\n");

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
          const extraDates = parseDates(cells ? cells.join(" ") : trimmed);
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

    const dates = parseDates(row.dates);
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
