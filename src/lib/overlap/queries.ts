/**
 * Classmate and shared-gap queries.
 *
 * **Privacy is enforced here, not in the UI.** SPEC §6, restated as code:
 *
 *  1. Room numbers and meeting times never leave this file for a non-friend.
 *     `getClassmates` returns identity only — no meetings are even selected.
 *  2. Shared gaps and "free right now" are accepted-friends-only. Every such
 *     function checks `areFriends` before it reads the other person's meetings.
 *  3. Discoverability is opt-in: `discoverable = false` keeps a user out of
 *     every roster, while still counting toward the aggregate.
 *  4. Blocks are mutual and silent: blocked ids are subtracted from every
 *     result set on both sides, and nothing tells the blocked party.
 *
 * If a screen needs data these functions do not provide, extend them here so
 * the checks stay in one place. Do not read `enrollments`, `meetings` or
 * `users` from a route or a component.
 */

import { and, desc, eq, inArray, isNotNull, ne, notInArray, sql } from "drizzle-orm";
import { getDb, type Db } from "../db";
import { courses, enrollments, meetings, sections, users } from "../db/schema";
import { areFriends, blockedUserIds, friendIds, relationshipWith, type RelationshipState } from "../friends";
import {
  DAY_END,
  DAY_START,
  MIN_GAP_MINUTES,
  emptyWeek,
  intervalAt,
  isFreeAt,
  nextSharedGap,
  sharedGaps,
  sharedGapsForWeek,
  type Interval,
  type WeekBusy,
} from "./intervals";

export interface ScheduleMeeting {
  weekday: number;
  startMin: number;
  endMin: number;
  location: string | null;
}

export interface ScheduleSection {
  sectionId: number;
  classNumber: number;
  sectionCode: string;
  component: string;
  instructor: string | null;
  meetings: ScheduleMeeting[];
}

export interface ScheduleCourse {
  courseId: number;
  subject: string;
  catalog: string;
  title: string | null;
  sections: ScheduleSection[];
}

/** Identity only. Deliberately carries no meeting, room or time information. */
export interface Classmate {
  id: string;
  handle: string | null;
  displayName: string | null;
  relationship: RelationshipState;
}

export interface ClassCount {
  sectionId: number;
  classNumber: number;
  sectionCode: string;
  component: string;
  courseId: number;
  subject: string;
  catalog: string;
  title: string | null;
  /** Everyone else enrolled in this exact section. Aggregate only. */
  otherCount: number;
  /** How many of those have opted in to being seen. */
  visibleCount: number;
}

export interface FreeFriend {
  profile: Classmate;
  /** When this shared window ends, in minutes from midnight. */
  until: number;
}

export interface FriendGap {
  profile: Classmate;
  weekday: number;
  interval: Interval;
}

/* ------------------------------------------------------------------ *
 * Term
 * ------------------------------------------------------------------ */

/** The term this user most recently pasted. */
export async function getCurrentTermCode(userId: string, db: Db = getDb()): Promise<string | null> {
  const [row] = await db
    .select({ termCode: enrollments.termCode })
    .from(enrollments)
    .where(eq(enrollments.userId, userId))
    .orderBy(desc(enrollments.termCode))
    .limit(1);
  return row?.termCode ?? null;
}

/* ------------------------------------------------------------------ *
 * Own schedule
 * ------------------------------------------------------------------ */

/** The caller's own schedule, in full. Self-scoped, so rooms are included. */
export async function getMySchedule(
  userId: string,
  termCode: string,
  db: Db = getDb(),
): Promise<ScheduleCourse[]> {
  const rows = await db
    .select({
      courseId: courses.id,
      subject: courses.subject,
      catalog: courses.catalog,
      title: courses.title,
      sectionId: sections.id,
      classNumber: sections.classNumber,
      sectionCode: sections.sectionCode,
      component: sections.component,
      instructor: sections.instructor,
      weekday: meetings.weekday,
      startMin: meetings.startMin,
      endMin: meetings.endMin,
      location: meetings.location,
    })
    .from(enrollments)
    .innerJoin(sections, eq(sections.id, enrollments.sectionId))
    .innerJoin(courses, eq(courses.id, sections.courseId))
    .leftJoin(meetings, eq(meetings.sectionId, sections.id))
    .where(and(eq(enrollments.userId, userId), eq(enrollments.termCode, termCode)));

  const byCourse = new Map<number, ScheduleCourse>();
  const bySection = new Map<number, ScheduleSection>();

  for (const row of rows) {
    let course = byCourse.get(row.courseId);
    if (!course) {
      course = {
        courseId: row.courseId,
        subject: row.subject,
        catalog: row.catalog,
        title: row.title,
        sections: [],
      };
      byCourse.set(row.courseId, course);
    }

    let section = bySection.get(row.sectionId);
    if (!section) {
      section = {
        sectionId: row.sectionId,
        classNumber: row.classNumber,
        sectionCode: row.sectionCode,
        component: row.component,
        instructor: row.instructor,
        meetings: [],
      };
      bySection.set(row.sectionId, section);
      course.sections.push(section);
    }

    if (row.weekday !== null && row.startMin !== null && row.endMin !== null) {
      section.meetings.push({
        weekday: row.weekday,
        startMin: row.startMin,
        endMin: row.endMin,
        location: row.location,
      });
    }
  }

  const out = [...byCourse.values()];
  for (const course of out) {
    course.sections.sort((a, b) => a.component.localeCompare(b.component) || a.classNumber - b.classNumber);
    for (const section of course.sections) {
      section.meetings.sort((a, b) => a.weekday - b.weekday || a.startMin - b.startMin);
    }
  }
  out.sort((a, b) => a.subject.localeCompare(b.subject) || a.catalog.localeCompare(b.catalog));
  return out;
}

/**
 * Busy intervals for a set of users, keyed by user id.
 *
 * Private on purpose. Every caller must have already established that the
 * viewer is allowed to see these people's time.
 */
async function busyWeeksFor(
  userIds: string[],
  termCode: string,
  db: Db,
): Promise<Map<string, WeekBusy>> {
  const out = new Map<string, WeekBusy>();
  if (!userIds.length) return out;

  const rows = await db
    .select({
      userId: enrollments.userId,
      weekday: meetings.weekday,
      startMin: meetings.startMin,
      endMin: meetings.endMin,
    })
    .from(enrollments)
    .innerJoin(meetings, eq(meetings.sectionId, enrollments.sectionId))
    .where(and(inArray(enrollments.userId, userIds), eq(enrollments.termCode, termCode)));

  for (const id of userIds) out.set(id, emptyWeek());
  for (const row of rows) {
    const week = out.get(row.userId);
    if (!week) continue;
    week[row.weekday].push({ start: row.startMin, end: row.endMin });
  }
  return out;
}

/** The caller's own busy week. */
export async function getMyBusyWeek(
  userId: string,
  termCode: string,
  db: Db = getDb(),
): Promise<WeekBusy> {
  const weeks = await busyWeeksFor([userId], termCode, db);
  return weeks.get(userId) ?? emptyWeek();
}

/* ------------------------------------------------------------------ *
 * Classmates
 * ------------------------------------------------------------------ */

/**
 * The caller's sections with a count of everyone else in each.
 *
 * The aggregate counts everybody, discoverable or not — a number reveals no
 * identity. `visibleCount` is how many of them the caller could actually name.
 * Blocked users are excluded from both.
 */
export async function getMyClassesWithCounts(
  userId: string,
  termCode: string,
  db: Db = getDb(),
): Promise<ClassCount[]> {
  const blocked = await blockedUserIds(userId, db);
  const excluded = [userId, ...blocked];

  const mine = await db
    .select({
      sectionId: sections.id,
      classNumber: sections.classNumber,
      sectionCode: sections.sectionCode,
      component: sections.component,
      courseId: courses.id,
      subject: courses.subject,
      catalog: courses.catalog,
      title: courses.title,
    })
    .from(enrollments)
    .innerJoin(sections, eq(sections.id, enrollments.sectionId))
    .innerJoin(courses, eq(courses.id, sections.courseId))
    .where(and(eq(enrollments.userId, userId), eq(enrollments.termCode, termCode)));

  if (!mine.length) return [];

  const counts = await db
    .select({
      sectionId: enrollments.sectionId,
      otherCount: sql<number>`count(*)`.mapWith(Number),
      visibleCount: sql<number>`count(*) filter (where ${users.discoverable})`.mapWith(Number),
    })
    .from(enrollments)
    .innerJoin(users, eq(users.id, enrollments.userId))
    .where(
      and(
        inArray(
          enrollments.sectionId,
          mine.map((m) => m.sectionId),
        ),
        isNotNull(users.verifiedAt),
        notInArray(enrollments.userId, excluded),
      ),
    )
    .groupBy(enrollments.sectionId);

  const bySection = new Map(counts.map((c) => [c.sectionId, c]));

  const rows: ClassCount[] = mine.map((m) => ({
    ...m,
    otherCount: bySection.get(m.sectionId)?.otherCount ?? 0,
    visibleCount: bySection.get(m.sectionId)?.visibleCount ?? 0,
  }));

  rows.sort(
    (a, b) =>
      a.subject.localeCompare(b.subject) ||
      a.catalog.localeCompare(b.catalog) ||
      a.component.localeCompare(b.component),
  );
  return rows;
}

/**
 * The people in one of the caller's sections.
 *
 * Returns identity only — no meetings are selected, so a room number cannot
 * leak through this path even by accident. Requires that the caller is in the
 * section, that the classmate has opted in, and that neither has blocked the
 * other.
 */
export async function getClassmates(
  userId: string,
  sectionId: number,
  db: Db = getDb(),
): Promise<Classmate[]> {
  const [enrolled] = await db
    .select({ sectionId: enrollments.sectionId })
    .from(enrollments)
    .where(and(eq(enrollments.userId, userId), eq(enrollments.sectionId, sectionId)))
    .limit(1);
  // You can only see the roster of a class you are actually in.
  if (!enrolled) return [];

  const blocked = await blockedUserIds(userId, db);

  const rows = await db
    .select({
      id: users.id,
      handle: users.handle,
      displayName: users.displayName,
    })
    .from(enrollments)
    .innerJoin(users, eq(users.id, enrollments.userId))
    .where(
      and(
        eq(enrollments.sectionId, sectionId),
        ne(enrollments.userId, userId),
        eq(users.discoverable, true),
        isNotNull(users.verifiedAt),
        blocked.length ? notInArray(users.id, blocked) : undefined,
      ),
    );

  const withRelationship = await Promise.all(
    rows.map(async (row) => ({
      ...row,
      relationship: await relationshipWith(userId, row.id, db),
    })),
  );

  withRelationship.sort((a, b) => {
    const rank = (r: RelationshipState) => (r === "friends" ? 0 : r === "request_received" ? 1 : 2);
    return (
      rank(a.relationship) - rank(b.relationship) ||
      (a.displayName ?? "").localeCompare(b.displayName ?? "")
    );
  });
  return withRelationship;
}

/**
 * A profile as one user may see another: identity, and whether they share any
 * section. Never a schedule, never a room, even between friends — the friend
 * views go through the gap functions below.
 */
export async function getVisibleProfile(
  viewerId: string,
  targetId: string,
  db: Db = getDb(),
): Promise<(Classmate & { sharedSectionCount: number }) | null> {
  if (viewerId === targetId) return null;
  const blocked = await blockedUserIds(viewerId, db);
  if (blocked.includes(targetId)) return null;

  const [target] = await db
    .select({ id: users.id, handle: users.handle, displayName: users.displayName, discoverable: users.discoverable })
    .from(users)
    .where(and(eq(users.id, targetId), isNotNull(users.verifiedAt)))
    .limit(1);
  if (!target) return null;

  const relationship = await relationshipWith(viewerId, targetId, db);
  // Someone who has not opted in is visible only to people already their friend.
  if (!target.discoverable && relationship !== "friends") return null;

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(enrollments)
    .where(
      and(
        eq(enrollments.userId, targetId),
        sql`${enrollments.sectionId} in (select section_id from ${enrollments} where user_id = ${viewerId})`,
      ),
    );

  return {
    id: target.id,
    handle: target.handle,
    displayName: target.displayName,
    relationship,
    sharedSectionCount: count,
  };
}

/**
 * Look up a profile by handle, subject to exactly the same checks as
 * `getVisibleProfile`. The handle is a public identifier, so resolving it must
 * not be a way around discoverability or a block.
 */
export async function getProfileByHandle(
  viewerId: string,
  handle: string,
  db: Db = getDb(),
): Promise<(Classmate & { sharedSectionCount: number }) | null> {
  const normalized = handle.trim().toLowerCase().replace(/^@/, "");
  if (!/^[a-z0-9_]{2,20}$/.test(normalized)) return null;

  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.handle, normalized), isNotNull(users.verifiedAt)))
    .limit(1);
  if (!row) return null;

  return getVisibleProfile(viewerId, row.id, db);
}

/* ------------------------------------------------------------------ *
 * Shared gaps — accepted friends only
 * ------------------------------------------------------------------ */

/**
 * Shared free windows for a whole week. Returns null — not an empty week —
 * when the two are not accepted friends, so a caller cannot mistake "no
 * permission" for "no free time".
 */
export async function getSharedGapsWith(
  userId: string,
  friendId: string,
  termCode: string,
  db: Db = getDb(),
): Promise<WeekBusy | null> {
  if (!(await areFriends(userId, friendId, db))) return null;
  const weeks = await busyWeeksFor([userId, friendId], termCode, db);
  return sharedGapsForWeek([weeks.get(userId) ?? emptyWeek(), weeks.get(friendId) ?? emptyWeek()]);
}

/** The next shared window with one friend. Null when they are not a friend. */
export async function getNextSharedGapWith(
  userId: string,
  friendId: string,
  termCode: string,
  now: { weekday: number; minute: number },
  db: Db = getDb(),
): Promise<{ weekday: number; interval: Interval } | null> {
  const week = await getSharedGapsWith(userId, friendId, termCode, db);
  if (!week) return null;
  return nextSharedGap(week, now.weekday, now.minute);
}

/**
 * Every accepted friend, with the next window the two of them share.
 * Non-friends are not reachable through this path at all.
 */
export async function getFriendsWithNextGap(
  userId: string,
  termCode: string,
  now: { weekday: number; minute: number },
  db: Db = getDb(),
): Promise<FriendGap[]> {
  const ids = await friendIds(userId, db);
  if (!ids.length) return [];

  const weeks = await busyWeeksFor([userId, ...ids], termCode, db);
  const mine = weeks.get(userId) ?? emptyWeek();

  const profiles = await db
    .select({ id: users.id, handle: users.handle, displayName: users.displayName })
    .from(users)
    .where(inArray(users.id, ids));

  const out: FriendGap[] = [];
  for (const profile of profiles) {
    const week = sharedGapsForWeek([mine, weeks.get(profile.id) ?? emptyWeek()]);
    const next = nextSharedGap(week, now.weekday, now.minute);
    if (!next) continue;
    out.push({
      profile: { ...profile, relationship: "friends" },
      weekday: next.weekday,
      interval: next.interval,
    });
  }

  out.sort((a, b) => {
    const dayA = (a.weekday - now.weekday + 7) % 7;
    const dayB = (b.weekday - now.weekday + 7) % 7;
    return dayA - dayB || a.interval.start - b.interval.start;
  });
  return out;
}

/**
 * Friends who are free at this exact minute, and for how much longer.
 * Accepted friends only, and only inside campus hours.
 */
export async function getFreeNow(
  userId: string,
  termCode: string,
  now: { weekday: number; minute: number },
  db: Db = getDb(),
): Promise<FreeFriend[]> {
  if (now.minute < DAY_START || now.minute >= DAY_END) return [];

  const ids = await friendIds(userId, db);
  if (!ids.length) return [];

  const weeks = await busyWeeksFor([userId, ...ids], termCode, db);
  const mine = weeks.get(userId) ?? emptyWeek();
  if (!isFreeAt(mine[now.weekday] ?? [], now.minute)) return [];

  const profiles = await db
    .select({ id: users.id, handle: users.handle, displayName: users.displayName })
    .from(users)
    .where(inArray(users.id, ids));

  const out: FreeFriend[] = [];
  for (const profile of profiles) {
    const theirs = weeks.get(profile.id) ?? emptyWeek();
    const shared = sharedGaps([mine[now.weekday] ?? [], theirs[now.weekday] ?? []], {
      minMinutes: 1,
    });
    const window = intervalAt(shared, now.minute);
    if (!window) continue;
    out.push({ profile: { ...profile, relationship: "friends" }, until: window.end });
  }

  out.sort((a, b) => b.until - a.until);
  return out;
}

export { MIN_GAP_MINUTES };
