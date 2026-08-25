/**
 * Validate a parsed schedule arriving from the browser.
 *
 * The parser runs client-side, so what reaches the server is user-controlled
 * even though the app produced it. This matters more here than in a typical
 * form: course and section rows are **shared between users**, so a bad payload
 * would not just corrupt one account, it would corrupt the row every other
 * student in that lecture points at.
 */

import type { ParsedCourse, ParsedMeeting, ParsedSection } from "../quest/parse";

export type ValidationResult =
  | { ok: true; value: { courses: ParsedCourse[]; termCode: string } }
  | { ok: false; error: string };

const SUBJECT_RE = /^[A-Z]{2,8}$/;
const CATALOG_RE = /^\d{1,3}[A-Z]{0,2}$/;
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

function nullableStr(value: unknown, max: number): string | null {
  if (value === null || value === undefined) return null;
  return str(value, max);
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
  const seenClassNumbers = new Set<number>();

  for (const item of raw.courses) {
    if (!item || typeof item !== "object") return { ok: false, error: "A course was malformed." };
    const c = item as Record<string, unknown>;

    const subject = str(c.subject, 8)?.toUpperCase();
    const catalog = str(c.catalog, 5)?.toUpperCase();
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

      const classNumber = int(s.classNumber, 1, 99999);
      if (classNumber === null) return { ok: false, error: "A class number looked wrong." };
      // Quest guarantees these unique within a term; a duplicate means the
      // payload was hand-edited.
      if (seenClassNumbers.has(classNumber)) {
        return { ok: false, error: "That schedule lists the same class twice." };
      }
      seenClassNumbers.add(classNumber);

      const sectionCode = str(s.sectionCode, 6)?.toUpperCase();
      const component = str(s.component, 4)?.toUpperCase();
      if (!sectionCode || !SECTION_CODE_RE.test(sectionCode)) {
        return { ok: false, error: "A section code looked wrong." };
      }
      if (!component || !COMPONENT_RE.test(component)) {
        return { ok: false, error: "A section component looked wrong." };
      }

      const startDate = nullableStr(s.startDate, 10);
      const endDate = nullableStr(s.endDate, 10);
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
        meetings.push({
          weekday,
          startMin,
          endMin,
          location: nullableStr(m.location, 40),
        });
      }

      sections.push({
        classNumber,
        sectionCode,
        component,
        instructor: nullableStr(s.instructor, 80),
        startDate,
        endDate,
        meetings,
      });
    }

    courses.push({
      subject,
      catalog,
      title: nullableStr(c.title, 120),
      status: "enrolled",
      sections,
    });
  }

  return { ok: true, value: { courses, termCode } };
}
