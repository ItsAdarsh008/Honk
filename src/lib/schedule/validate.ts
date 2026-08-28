/**
 * Validate a parsed schedule arriving from the browser.
 *
 * The parser runs client-side, so what reaches the server is user-controlled
 * even though the app produced it. This matters more here than in a typical
 * form: course and section rows are **shared between users**, so a bad payload
 * would not just corrupt one account, it would corrupt the row every other
 * student in that lecture points at.
 */

import {
  resolveSectionKeys,
  type ParsedCourse,
  type ParsedMeeting,
  type ParsedSection,
} from "./types";

export type ValidationResult =
  | { ok: true; value: { courses: ParsedCourse[]; termCode: string } }
  | { ok: false; error: string };

/**
 * Course codes, across five registrars.
 *
 * `CS 135` and `MATH 245B` at Waterloo, `COMPSCI 1MD3` at McMaster, `ECON
 * 1P92` at Brock, `PSYC 1000` at Guelph-Humber, `AP/ECON 1000` at York — the
 * faculty prefix included, because that is how York writes and reads a code.
 * Loose enough to admit all of them and still tight enough that these are the
 * only thing that reaches a row other students share.
 */
const SUBJECT_RE = /^[A-Z]{2,10}(?:\/[A-Z]{2,10})?$/;
const CATALOG_RE = /^\d[0-9A-Z]{0,6}$/;
const COMPONENT_RE = /^[A-Z]{2,4}$/;
const SECTION_CODE_RE = /^[A-Z0-9]{1,6}$/;
const TERM_RE = /^\d{4}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const MAX_COURSES = 20;
const MAX_SECTIONS = 12;
const MAX_MEETINGS = 14;

function str(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

/**
 * Absent is fine; present-but-wrong is not.
 *
 * These fields land in rows other students share, so an over-long or
 * wrong-typed value is refused rather than quietly nulled — a payload that has
 * been tampered with should fail loudly, not write half of itself.
 */
const INVALID = Symbol("invalid");

function optionalStr(value: unknown, max: number): string | null | typeof INVALID {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return INVALID;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > max) return INVALID;
  return trimmed;
}

function int(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  if (value < min || value > max) return null;
  return value;
}

export function validateSchedule(input: unknown): ValidationResult {
  if (!input || typeof input !== "object") return { ok: false, error: "Nothing to save." };
  const raw = input as { courses?: unknown; termCode?: unknown };

  const termCode = typeof raw.termCode === "string" ? raw.termCode.trim() : "";
  if (!TERM_RE.test(termCode)) return { ok: false, error: "That schedule has no readable term." };

  if (!Array.isArray(raw.courses) || raw.courses.length === 0) {
    return { ok: false, error: "That schedule has no courses in it." };
  }
  if (raw.courses.length > MAX_COURSES) {
    return { ok: false, error: `A schedule can hold up to ${MAX_COURSES} courses.` };
  }

  const courses: ParsedCourse[] = [];

  for (const item of raw.courses) {
    if (!item || typeof item !== "object") return { ok: false, error: "A course was malformed." };
    const c = item as Record<string, unknown>;

    const subject = str(c.subject, 21)?.toUpperCase();
    const catalog = str(c.catalog, 7)?.toUpperCase();
    if (!subject || !SUBJECT_RE.test(subject)) return { ok: false, error: "A course code looked wrong." };
    if (!catalog || !CATALOG_RE.test(catalog)) return { ok: false, error: "A course number looked wrong." };

    if (!Array.isArray(c.sections) || c.sections.length === 0) {
      return { ok: false, error: `${subject} ${catalog} has no sections.` };
    }
    if (c.sections.length > MAX_SECTIONS) {
      return { ok: false, error: `${subject} ${catalog} has too many sections.` };
    }

    const sections: ParsedSection[] = [];
    for (const sectionItem of c.sections) {
      if (!sectionItem || typeof sectionItem !== "object") {
        return { ok: false, error: "A section was malformed." };
      }
      const s = sectionItem as Record<string, unknown>;

      /*
       * A class number where the portal prints one, and null where it does
       * not. Absent is the common case now — only PeopleSoft has them — but
       * present-and-malformed is still refused, because the number is written
       * into a row every other student in that class points at.
       */
      const classNumber =
        s.classNumber === null || s.classNumber === undefined
          ? null
          : int(s.classNumber, 1, 99999);
      if (s.classNumber !== null && s.classNumber !== undefined && classNumber === null) {
        return { ok: false, error: "A class number looked wrong." };
      }

      const sectionCode = str(s.sectionCode, 6)?.toUpperCase();
      const component = str(s.component, 4)?.toUpperCase();
      if (!sectionCode || !SECTION_CODE_RE.test(sectionCode)) {
        return { ok: false, error: "A section code looked wrong." };
      }
      if (!component || !COMPONENT_RE.test(component)) {
        return { ok: false, error: "A section component looked wrong." };
      }

      const startDate = optionalStr(s.startDate, 10);
      const endDate = optionalStr(s.endDate, 10);
      if (startDate === INVALID || endDate === INVALID) {
        return { ok: false, error: "A date looked wrong." };
      }
      if (startDate && !ISO_DATE_RE.test(startDate)) return { ok: false, error: "A date looked wrong." };
      if (endDate && !ISO_DATE_RE.test(endDate)) return { ok: false, error: "A date looked wrong." };

      const meetingsRaw = Array.isArray(s.meetings) ? s.meetings : [];
      if (meetingsRaw.length > MAX_MEETINGS) {
        return { ok: false, error: "A section has too many meeting times." };
      }

      const meetings: ParsedMeeting[] = [];
      for (const meetingItem of meetingsRaw) {
        if (!meetingItem || typeof meetingItem !== "object") {
          return { ok: false, error: "A meeting time was malformed." };
        }
        const m = meetingItem as Record<string, unknown>;
        const weekday = int(m.weekday, 1, 7);
        const startMin = int(m.startMin, 0, 24 * 60);
        const endMin = int(m.endMin, 0, 24 * 60);
        if (weekday === null || startMin === null || endMin === null || endMin <= startMin) {
          return { ok: false, error: "A meeting time looked wrong." };
        }
        const location = optionalStr(m.location, 40);
        if (location === INVALID) return { ok: false, error: "A room looked wrong." };
        meetings.push({ weekday, startMin, endMin, location });
      }

      const instructor = optionalStr(s.instructor, 80);
      if (instructor === INVALID) return { ok: false, error: "An instructor name looked wrong." };

      const section: ParsedSection = {
        classNumber,
        sectionCode,
        // Trusted only as a hint that identity should come from the meeting
        // pattern instead — it can never widen what this section matches.
        sectionCodeInferred: s.sectionCodeInferred === true,
        component,
        instructor,
        startDate,
        endDate,
        meetings,
      };

      sections.push(section);
    }

    const title = optionalStr(c.title, 120);
    if (title === INVALID) return { ok: false, error: "A course title looked wrong." };

    courses.push({
      subject,
      catalog,
      title,
      status: "enrolled",
      sections,
    });
  }

  /*
   * Sections that could not be told apart are settled here rather than
   * refused. A collision used to reject the whole schedule, which is how a
   * York student ended up unable to save a term over two components of one
   * course that the parser read as the same section.
   */
  const { duplicates } = resolveSectionKeys(courses);
  if (duplicates.size) {
    for (const course of courses) {
      course.sections = course.sections.filter((section) => !duplicates.has(section));
    }
  }

  const kept = courses.filter((course) => course.sections.length > 0);
  if (!kept.length) return { ok: false, error: "That schedule has no courses in it." };

  return { ok: true, value: { courses: kept, termCode } };
}
