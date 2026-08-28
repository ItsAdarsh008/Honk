import "server-only";

/**
 * Numbers for the admin dashboard.
 *
 * **Counts only. No function here returns a row about a person** — no
 * addresses, no handles, no schedules, not even an id. That is not a
 * convention, it is the reason this file is allowed to touch `users` and
 * `enrollments` at all: SPEC §6 permits aggregates to everyone precisely
 * because a count names nobody, and the same rule is what lets an operator
 * look without becoming a person who can read schedules.
 *
 * If this ever needs to answer "who", it does not get to — that question goes
 * through `overlap/queries.ts` with a viewer and its checks.
 */

import { desc, eq, isNotNull, sql } from "drizzle-orm";
import { getDb, hasDatabase } from "../db";
import { enrollments, meetings, sections, users } from "../db/schema";
import { LIVE_SCHOOLS, schoolOrDefault } from "../schools";

export interface SchoolCount {
  schoolId: string;
  name: string;
  short: string;
  beta: boolean;
  /** Verified accounts at this school. */
  users: number;
  /** How many of those have actually pasted a schedule. */
  withSchedule: number;
}

export interface DayCount {
  /** ISO yyyy-mm-dd */
  date: string;
  count: number;
}

export interface AdminStats {
  totalUsers: number;
  withSchedule: number;
  schools: SchoolCount[];
  signups: DayCount[];
  /** Rows, for the storage estimate. */
  sectionRows: number;
  meetingRows: number;
  enrollmentRows: number;
}

const SIGNUP_DAYS = 30;

export async function getAdminStats(): Promise<AdminStats | null> {
  if (!hasDatabase()) return null;
  const db = getDb();

  /*
   * Two grouped counts rather than one with a correlated subquery.
   *
   * The `exists (... where e.user_id = users.id)` form is the obvious way to
   * write this and drizzle renders the correlation as a bare `"id"`, which
   * Postgres reads as a column of `enrollments` and rejects. Two queries and a
   * join in memory is both correct and, over ten rows, free.
   */
  const [bySchool, scheduledBySchool, signupRows, sectionRows, meetingRows, enrollmentRows] =
    await Promise.all([
      db
        .select({
          schoolId: users.schoolId,
          users: sql<number>`count(*)`.mapWith(Number),
        })
        .from(users)
        .where(isNotNull(users.verifiedAt))
        .groupBy(users.schoolId),

      db
        .select({
          schoolId: users.schoolId,
          withSchedule: sql<number>`count(distinct ${enrollments.userId})`.mapWith(Number),
        })
        .from(enrollments)
        .innerJoin(users, eq(users.id, enrollments.userId))
        .where(isNotNull(users.verifiedAt))
        .groupBy(users.schoolId),

      db
        .select({
          date: sql<string>`to_char(${users.createdAt} at time zone 'America/Toronto', 'YYYY-MM-DD')`,
          count: sql<number>`count(*)`.mapWith(Number),
        })
        .from(users)
        .where(
          sql`${users.verifiedAt} is not null and ${users.createdAt} > now() - interval '${sql.raw(
            String(SIGNUP_DAYS),
          )} days'`,
        )
        .groupBy(sql`1`)
        .orderBy(sql`1`),

      db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(sections),
      db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(meetings),
      db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(enrollments),
    ]);

  const counts = new Map(bySchool.map((row) => [row.schoolId, row.users]));
  const scheduled = new Map(scheduledBySchool.map((row) => [row.schoolId, row.withSchedule]));

  /*
   * Every live school appears, including the ones with nobody in them. A zero
   * is the most useful number on this page — it is the difference between "the
   * parser is broken at Brock" and "nobody at Brock has tried yet", and a row
   * that is simply absent answers neither.
   */
  const schools: SchoolCount[] = LIVE_SCHOOLS.map((school) => {
    return {
      schoolId: school.id,
      name: school.name,
      short: school.short,
      beta: school.beta,
      users: counts.get(school.id) ?? 0,
      withSchedule: scheduled.get(school.id) ?? 0,
    };
  });

  // Anyone whose school id is not a live school — a renamed id, or a row from
  // before the school existed. Worth surfacing rather than silently dropping.
  for (const [schoolId, count] of counts) {
    if (schools.some((s) => s.schoolId === schoolId)) continue;
    schools.push({
      schoolId,
      name: schoolOrDefault(schoolId).name,
      short: schoolOrDefault(schoolId).short,
      beta: true,
      users: count,
      withSchedule: scheduled.get(schoolId) ?? 0,
    });
  }

  schools.sort((a, b) => b.users - a.users || a.name.localeCompare(b.name));

  return {
    totalUsers: schools.reduce((n, s) => n + s.users, 0),
    withSchedule: schools.reduce((n, s) => n + s.withSchedule, 0),
    schools,
    signups: fillDays(signupRows, SIGNUP_DAYS),
    sectionRows: sectionRows[0]?.n ?? 0,
    meetingRows: meetingRows[0]?.n ?? 0,
    enrollmentRows: enrollmentRows[0]?.n ?? 0,
  };
}

/**
 * A day with no signups is a zero, not a missing point.
 *
 * Plotting only the days that had signups draws a line that slopes through the
 * quiet days as if they were busy, which is the single most common way a
 * growth chart lies.
 */
function fillDays(rows: DayCount[], days: number): DayCount[] {
  const found = new Map(rows.map((r) => [r.date, r.count]));
  const out: DayCount[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const date = d.toISOString().slice(0, 10);
    out.push({ date, count: found.get(date) ?? 0 });
  }
  return out;
}

/** The most recent term anybody has pasted. Context for the numbers above. */
export async function getLatestTerm(): Promise<string | null> {
  if (!hasDatabase()) return null;
  const [row] = await getDb()
    .select({ termCode: enrollments.termCode })
    .from(enrollments)
    .orderBy(desc(enrollments.termCode))
    .limit(1);
  return row?.termCode ?? null;
}
