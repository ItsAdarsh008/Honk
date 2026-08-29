import "server-only";

/**
 * Persist a parsed schedule.
 *
 * Course and section rows are **shared**, not copied per user: two students in
 * the same lecture end up pointing at the same `sections` row. That is what
 * makes the classmate query an index lookup, and it means one person's paste
 * improves the data for everyone — a corrected room number propagates.
 *
 * Shared *within a school*. Every course and section row carries the school
 * that owns it, and nothing here ever writes or reads across that line: a York
 * `ECON 1000` and a Guelph-Humber `ECON 1000` are two rows that happen to have
 * the same name. Cross-campus friends still see each other's free time, which
 * is computed from meetings rather than from shared rows.
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb, type Db } from "../db";
import { courses, enrollments, meetings, sections, terms } from "../db/schema";
import { termName } from "../time";
import { resolveSectionKeys, type ParsedCourse, type ParseResult } from "./types";

export interface SaveResult {
  termCode: string;
  courseCount: number;
  sectionCount: number;
  meetingCount: number;
}

/**
 * Replaces the user's enrollments for the term. Re-pasting is the way you
 * correct a schedule, so this is idempotent: paste twice, get one schedule.
 */
export async function saveSchedule(
  userId: string,
  schoolId: string,
  parsed: Pick<ParseResult, "courses" | "termCode">,
  db: Db = getDb(),
): Promise<SaveResult> {
  const termCode = parsed.termCode;
  if (!termCode) throw new Error("Cannot save a schedule without a term.");
  if (!parsed.courses.length) throw new Error("Cannot save an empty schedule.");

  await ensureTerm(termCode, parsed.courses, db);

  /*
   * Keys are resolved across the whole schedule, not per section, so that two
   * components the parser could not tell apart get distinct rows instead of
   * silently merging into one. Must be the same call the validator made, or
   * the row written would not be the row that was checked.
   */
  const { keys } = resolveSectionKeys(parsed.courses);

  const sectionIds: number[] = [];
  let meetingCount = 0;

  for (const course of parsed.courses) {
    const courseId = await upsertCourse(schoolId, course, db);

    for (const section of course.sections) {
      const [sectionRow] = await db
        .insert(sections)
        .values({
          schoolId,
          courseId,
          termCode,
          sectionKey: keys.get(section) ?? `${course.subject}.${course.catalog}.${section.component}.${section.sectionCode}`,
          classNumber: section.classNumber,
          sectionCode: section.sectionCode,
          component: section.component,
          instructor: section.instructor,
          startDate: section.startDate,
          endDate: section.endDate,
        })
        .onConflictDoUpdate({
          target: [sections.schoolId, sections.termCode, sections.sectionKey],
          set: {
            // A later paste fills in what an earlier one left blank, but never
            // blanks out something already known.
            sectionCode: section.sectionCode,
            component: section.component,
            classNumber: sql`coalesce(${section.classNumber ?? null}, ${sections.classNumber})`,
            instructor: sql`coalesce(${section.instructor ?? null}, ${sections.instructor})`,
            startDate: sql`coalesce(${section.startDate ?? null}, ${sections.startDate})`,
            endDate: sql`coalesce(${section.endDate ?? null}, ${sections.endDate})`,
          },
        })
        .returning({ id: sections.id });

      sectionIds.push(sectionRow.id);

      for (const meeting of section.meetings) {
        await db
          .insert(meetings)
          .values({
            sectionId: sectionRow.id,
            weekday: meeting.weekday,
            startMin: meeting.startMin,
            endMin: meeting.endMin,
            location: meeting.location,
          })
          .onConflictDoUpdate({
            target: [meetings.sectionId, meetings.weekday, meetings.startMin, meetings.endMin],
            set: { location: sql`coalesce(${meeting.location ?? null}, ${meetings.location})` },
          });
        meetingCount += 1;
      }
    }
  }

  // Replace this user's enrollments for the term, leaving other terms alone.
  await db
    .delete(enrollments)
    .where(and(eq(enrollments.userId, userId), eq(enrollments.termCode, termCode)));

  if (sectionIds.length) {
    await db
      .insert(enrollments)
      .values(sectionIds.map((sectionId) => ({ userId, sectionId, termCode })))
      .onConflictDoNothing();
  }

  return {
    termCode,
    courseCount: parsed.courses.length,
    sectionCount: sectionIds.length,
    meetingCount,
  };
}

async function upsertCourse(schoolId: string, course: ParsedCourse, db: Db): Promise<number> {
  const [row] = await db
    .insert(courses)
    .values({
      schoolId,
      subject: course.subject,
      catalog: course.catalog,
      title: course.title,
    })
    .onConflictDoUpdate({
      target: [courses.schoolId, courses.subject, courses.catalog],
      set: { title: sql`coalesce(${course.title ?? null}, ${courses.title})` },
    })
    .returning({ id: courses.id });
  return row.id;
}

async function ensureTerm(termCode: string, parsedCourses: ParsedCourse[], db: Db): Promise<void> {
  const dates = parsedCourses
    .flatMap((c) => c.sections)
    .flatMap((s) => [s.startDate, s.endDate])
    .filter((d): d is string => Boolean(d))
    .sort();

  await db
    .insert(terms)
    .values({
      code: termCode,
      name: termName(termCode),
      startDate: dates[0] ?? null,
      endDate: dates[dates.length - 1] ?? null,
    })
    .onConflictDoNothing();
}

/**
 * Hard delete, not a soft flag. Removes every enrollment for the user; the
 * shared course and section rows stay, since other people point at them.
 */
export async function deleteSchedule(
  userId: string,
  termCode?: string,
  db: Db = getDb(),
): Promise<number> {
  const where = termCode
    ? and(eq(enrollments.userId, userId), eq(enrollments.termCode, termCode))
    : eq(enrollments.userId, userId);
  const deleted = await db.delete(enrollments).where(where).returning({ sectionId: enrollments.sectionId });
  return deleted.length;
}

/** Term codes this user has pasted, newest first. */
export async function listTerms(userId: string, db: Db = getDb()): Promise<string[]> {
  const rows = await db
    .selectDistinct({ termCode: enrollments.termCode })
    .from(enrollments)
    .where(eq(enrollments.userId, userId));
  return rows.map((r) => r.termCode).sort((a, b) => b.localeCompare(a));
}

/** Used by the tests to prune orphaned sections. Not called by the app. */
export async function sectionIdsForTerm(termCode: string, db: Db = getDb()): Promise<number[]> {
  const rows = await db.select({ id: sections.id }).from(sections).where(eq(sections.termCode, termCode));
  return rows.map((r) => r.id);
}

export async function deleteSections(ids: number[], db: Db = getDb()): Promise<void> {
  if (!ids.length) return;
  await db.delete(sections).where(inArray(sections.id, ids));
}
