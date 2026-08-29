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
import {
  areFriends,
  blockedUserIds,
  friendIds,
  relationshipWith,
  relationshipsWith,
  type RelationshipState,
} from "../friends";
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
  shiftWeek,
  type Interval,
  type WeekBusy,
} from "./intervals";
import { schoolOrDefault } from "../schools";
import { CAMPUS_TZ, tzOffsetMinutes } from "../time";

export interface ScheduleMeeting {
  weekday: number;
  startMin: number;
  endMin: number;
  location: string | null;
}

export interface ScheduleSection {
  sectionId: number;
  /** PeopleSoft prints one; most portals do not. */
  classNumber: number | null;
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
  /**
   * Which university. Shown next to a name only when it differs from the
   * viewer's, which is the only time it tells anyone anything — and it is not
   * a privacy loss: an address at that school is what created the account, and
   * the school is the reason the two of them can see each other at all.
   */
  schoolId: string;
  relationship: RelationshipState;
}

export interface ClassCount {
  sectionId: number;
  classNumber: number | null;
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
    // Class number where there is one, section code where there is not.
    course.sections.sort(
      (a, b) =>
        a.component.localeCompare(b.component) ||
        (a.classNumber ?? 0) - (b.classNumber ?? 0) ||
        a.sectionCode.localeCompare(b.sectionCode),
    );
    for (const section of course.sections) {
      section.meetings.sort((a, b) => a.weekday - b.weekday || a.startMin - b.startMin);
    }
  }
  out.sort((a, b) => a.subject.localeCompare(b.subject) || a.catalog.localeCompare(b.catalog));
  return out;
}

/**
 * The term each of these people is actually in, by their own reckoning.
 *
 * One term code cannot be assumed to mean the same thing to two people once
 * they are at different universities. Honk derives a term from the dates in a
 * paste, and schools do not agree on where a term starts: York's Fall/Winter
 * courses run September to April and derive to `1269`, so in January a York
 * student is still on `1269` while a Waterloo friend has moved to `1271`.
 *
 * Reading everybody at the viewer's term code was the bug that made that
 * dangerous rather than merely untidy — see `busyWeeksFor`.
 */
async function currentTerms(userIds: string[], db: Db): Promise<Map<string, string>> {
  if (!userIds.length) return new Map();
  const rows = await db
    .select({
      userId: enrollments.userId,
      termCode: sql<string>`max(${enrollments.termCode})`,
    })
    .from(enrollments)
    .where(inArray(enrollments.userId, userIds))
    .groupBy(enrollments.userId);
  return new Map(rows.map((row) => [row.userId, row.termCode]));
}

/**
 * Busy intervals for a set of users, keyed by user id, all expressed in one
 * time zone.
 *
 * Private on purpose. Every caller must have already established that the
 * viewer is allowed to see these people's time.
 *
 * Two things here exist because Honk is at more than one university, and both
 * are about the same failure: a schedule that could not be read must never
 * come back looking like a schedule with nothing in it.
 *
 * **Everyone is read at their own term.** Filtering every user by the viewer's
 * term code meant a friend whose term is coded differently matched no rows,
 * and an empty result was indistinguishable from an empty week. That rendered
 * them free from eight in the morning until ten at night, every day — a
 * confident, specific, wrong answer, which is the worst kind.
 *
 * **Somebody with no schedule at all is absent, not free.** They are left out
 * of the returned map entirely, so callers skip them instead of inventing
 * availability for them. This was always true of a friend who had not pasted
 * yet; it just became common.
 *
 * `viewerTimezone` is the other half of comparability. Meetings are stored in
 * the campus-local minutes their portal printed, which is the only sane thing
 * to store — but two people's minutes only mean the same thing if their
 * campuses keep the same clock. Everywhere Honk is live does today, so the
 * shift is zero and this costs nothing; the moment a school west of Ontario
 * turns on it is the difference between "free at 2" meaning one hour and
 * meaning two different afternoons.
 */
async function busyWeeksFor(
  terms: Map<string, string>,
  db: Db,
  viewerTimezone: string = CAMPUS_TZ,
  now: Date = new Date(),
): Promise<Map<string, WeekBusy>> {
  const out = new Map<string, WeekBusy>();
  const userIds = [...terms.keys()];
  if (!userIds.length) return out;

  const rows = await db
    .select({
      userId: enrollments.userId,
      termCode: enrollments.termCode,
      schoolId: users.schoolId,
      weekday: meetings.weekday,
      startMin: meetings.startMin,
      endMin: meetings.endMin,
    })
    .from(enrollments)
    .innerJoin(meetings, eq(meetings.sectionId, enrollments.sectionId))
    .innerJoin(users, eq(users.id, enrollments.userId))
    .where(inArray(enrollments.userId, userIds));

  const schoolOf = new Map<string, string>();
  for (const row of rows) {
    // Each person's own term, not the viewer's.
    if (row.termCode !== terms.get(row.userId)) continue;
    let week = out.get(row.userId);
    if (!week) {
      week = emptyWeek();
      out.set(row.userId, week);
    }
    schoolOf.set(row.userId, row.schoolId);
    week[row.weekday].push({ start: row.startMin, end: row.endMin });
  }

  const viewerOffset = tzOffsetMinutes(viewerTimezone, now);
  for (const [id, week] of out) {
    const theirTz = schoolOrDefault(schoolOf.get(id)).timezone;
    const shift = viewerOffset - tzOffsetMinutes(theirTz, now);
    if (shift !== 0) out.set(id, shiftWeek(week, shift));
  }
  return out;
}

/**
 * The busy weeks for a viewer and the people they are allowed to see.
 *
 * The viewer is pinned to the term they are looking at; everybody else is read
 * at whatever term they are actually in.
 */
async function weeksForViewerAnd(
  viewerId: string,
  otherIds: string[],
  termCode: string,
  db: Db,
): Promise<Map<string, WeekBusy>> {
  const terms = await currentTerms(otherIds, db);
  terms.set(viewerId, termCode);
  return busyWeeksFor(terms, db, await timezoneFor(viewerId, db));
}

/** The caller's own busy week, in their own campus's clock. */
export async function getMyBusyWeek(
  userId: string,
  termCode: string,
  db: Db = getDb(),
): Promise<WeekBusy> {
  const weeks = await busyWeeksFor(new Map([[userId, termCode]]), db);
  return weeks.get(userId) ?? emptyWeek();
}

/** The time zone to read a user's own week in. */
async function timezoneFor(userId: string, db: Db): Promise<string> {
  const [row] = await db
    .select({ schoolId: users.schoolId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return schoolOrDefault(row?.schoolId).timezone;
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
      schoolId: users.schoolId,
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

  // One query for the whole room, not one per person in it. See
  // `relationshipsWith` for why that mattered more than it looks.
  const relationships = await relationshipsWith(userId, rows.map((row) => row.id), db);
  const withRelationship = rows.map((row) => ({
    ...row,
    relationship: relationships.get(row.id) ?? ("none" as RelationshipState),
  }));

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
 * Which accepted friends are in each of the caller's sections.
 *
 * This is what turns the week grid from a timetable into the thing Honk is
 * for: a block that says "CS 135" is a class, and a block that says "CS 135,
 * with Priya" is a reason to go.
 *
 * Friends only, and only sections the caller is enrolled in — so this adds
 * nothing anybody could not already see. A friend's presence in a shared class
 * is exactly the fact `getClassmates` would return for a discoverable person,
 * minus the discoverability requirement, which accepted friendship supersedes:
 * they agreed to be visible to this person specifically.
 */
export async function getFriendsBySection(
  userId: string,
  termCode: string,
  db: Db = getDb(),
): Promise<Map<number, Classmate[]>> {
  const out = new Map<number, Classmate[]>();
  const ids = await friendIds(userId, db);
  if (!ids.length) return out;

  const rows = await db
    .select({
      sectionId: enrollments.sectionId,
      id: users.id,
      handle: users.handle,
      displayName: users.displayName,
      schoolId: users.schoolId,
    })
    .from(enrollments)
    .innerJoin(users, eq(users.id, enrollments.userId))
    .where(
      and(
        inArray(enrollments.userId, ids),
        isNotNull(users.verifiedAt),
        sql`${enrollments.sectionId} in (
          select section_id from ${enrollments}
          where user_id = ${userId} and term_code = ${termCode}
        )`,
      ),
    );

  for (const row of rows) {
    const list = out.get(row.sectionId) ?? [];
    list.push({
      id: row.id,
      handle: row.handle,
      displayName: row.displayName,
      schoolId: row.schoolId,
      relationship: "friends",
    });
    out.set(row.sectionId, list);
  }
  for (const list of out.values()) {
    list.sort((a, b) => (a.displayName ?? "").localeCompare(b.displayName ?? ""));
  }
  return out;
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
    .select({
      id: users.id,
      handle: users.handle,
      displayName: users.displayName,
      schoolId: users.schoolId,
      discoverable: users.discoverable,
    })
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
    schoolId: target.schoolId,
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
 * Shared free windows for a whole week.
 *
 * Returns null — not an empty week — in the two cases where there is no answer
 * to give: the pair are not accepted friends, or one of them has no schedule
 * saved at all. Both would otherwise come back as a week of perfect
 * availability, and a caller cannot be expected to tell that apart from a
 * genuinely empty timetable.
 */
export async function getSharedGapsWith(
  userId: string,
  friendId: string,
  termCode: string,
  db: Db = getDb(),
): Promise<WeekBusy | null> {
  if (!(await areFriends(userId, friendId, db))) return null;
  const weeks = await weeksForViewerAnd(userId, [friendId], termCode, db);
  const mine = weeks.get(userId);
  const theirs = weeks.get(friendId);
  if (!mine || !theirs) return null;
  return sharedGapsForWeek([mine, theirs]);
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

  const weeks = await weeksForViewerAnd(userId, ids, termCode, db);
  const mine = weeks.get(userId);
  if (!mine) return [];

  const profiles = await db
    .select({
      id: users.id,
      handle: users.handle,
      displayName: users.displayName,
      schoolId: users.schoolId,
    })
    .from(users)
    .where(inArray(users.id, ids));

  const out: FriendGap[] = [];
  for (const profile of profiles) {
    // No schedule saved is not the same as nothing on this week. Somebody who
    // has not pasted, or whose term is coded differently, is left out rather
    // than advertised as free.
    const theirs = weeks.get(profile.id);
    if (!theirs) continue;
    const week = sharedGapsForWeek([mine, theirs]);
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

  const weeks = await weeksForViewerAnd(userId, ids, termCode, db);
  const mine = weeks.get(userId);
  if (!mine || !isFreeAt(mine[now.weekday] ?? [], now.minute)) return [];

  const profiles = await db
    .select({
      id: users.id,
      handle: users.handle,
      displayName: users.displayName,
      schoolId: users.schoolId,
    })
    .from(users)
    .where(inArray(users.id, ids));

  const out: FreeFriend[] = [];
  for (const profile of profiles) {
    const theirs = weeks.get(profile.id);
    if (!theirs) continue;
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
