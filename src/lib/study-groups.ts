/**
 * Study groups.
 *
 * **Privacy is enforced here**, alongside `overlap/queries.ts` and
 * `friends.ts`, which is why this module is on the short list allowed to read
 * `enrollments` and `users`. One rule does most of the work:
 *
 *   You may see, create or join a study group only for a section you are
 *   enrolled in.
 *
 * Everything else follows from it. A group cannot be used to discover people
 * in a class you do not take, because you cannot see the group at all; and a
 * group cannot be used to reach somebody who is not your classmate, because
 * nobody else can join it.
 *
 * The one thing this module never does is read a meeting. Whether a group is
 * free on Thursday is a question about times, and times live behind
 * `overlap/queries.ts` — `getStudyGroupWeek` answers it there, gated on the
 * same membership this file decides.
 *
 * **Joining is the consent.** SPEC §6 says shared free time is for accepted
 * friends only. A study group is the deliberate second case, and it is less a
 * loophole in that rule than the same rule with a different act of agreement
 * behind it: nobody is placed in a group, membership is a button somebody
 * presses about one class, the screen says what it shares before they press
 * it, and leaving is one tap and takes effect immediately.
 */

import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { getDb, type Db } from "./db";
import {
  enrollments,
  studyGroupMembers,
  studyGroups,
  users,
  STUDY_GROUP_NAME_MAX,
} from "./db/schema";
import { blockedUserIds } from "./friends";

export interface StudyGroupMember {
  id: string;
  handle: string | null;
  displayName: string | null;
  schoolId: string;
}

export interface StudyGroupSummary {
  id: number;
  sectionId: number;
  name: string;
  memberCount: number;
  /** Whether the caller is in it, which decides what the button says. */
  joined: boolean;
  createdByYou: boolean;
}

export interface StudyGroupResult {
  ok: boolean;
  error?: string;
  groupId?: number;
}

/** The gate every other function in this file goes through first. */
async function isEnrolled(userId: string, sectionId: number, db: Db): Promise<boolean> {
  const [row] = await db
    .select({ sectionId: enrollments.sectionId })
    .from(enrollments)
    .where(and(eq(enrollments.userId, userId), eq(enrollments.sectionId, sectionId)))
    .limit(1);
  return row !== undefined;
}

/** True when the caller is in the group. The gate for anything about it. */
export async function isGroupMember(
  userId: string,
  groupId: number,
  db: Db = getDb(),
): Promise<boolean> {
  const [row] = await db
    .select({ userId: studyGroupMembers.userId })
    .from(studyGroupMembers)
    .where(and(eq(studyGroupMembers.groupId, groupId), eq(studyGroupMembers.userId, userId)))
    .limit(1);
  return row !== undefined;
}

/**
 * The groups for one of the caller's sections.
 *
 * Every group in the section, joined or not — a study group nobody outside can
 * see is a study group nobody joins. The caller is already known to be in the
 * section, so this names no class they were not already in.
 */
export async function listGroupsForSection(
  userId: string,
  sectionId: number,
  db: Db = getDb(),
): Promise<StudyGroupSummary[]> {
  if (!(await isEnrolled(userId, sectionId, db))) return [];

  const rows = await db
    .select({
      id: studyGroups.id,
      sectionId: studyGroups.sectionId,
      name: studyGroups.name,
      createdById: studyGroups.createdById,
      memberCount: sql<number>`count(${studyGroupMembers.userId})`.mapWith(Number),
      joined: sql<boolean>`bool_or(${studyGroupMembers.userId} = ${userId})`.mapWith(Boolean),
    })
    .from(studyGroups)
    .leftJoin(studyGroupMembers, eq(studyGroupMembers.groupId, studyGroups.id))
    .where(eq(studyGroups.sectionId, sectionId))
    .groupBy(studyGroups.id);

  return rows
    .map((row) => ({
      id: row.id,
      sectionId: row.sectionId,
      name: row.name,
      memberCount: row.memberCount,
      joined: row.joined === true,
      createdByYou: row.createdById === userId,
    }))
    .sort((a, b) => Number(b.joined) - Number(a.joined) || b.memberCount - a.memberCount);
}

/** Everyone in a group the caller is also in. Names only — never a time. */
export async function listGroupMembers(
  userId: string,
  groupId: number,
  db: Db = getDb(),
): Promise<StudyGroupMember[]> {
  if (!(await isGroupMember(userId, groupId, db))) return [];

  const blocked = await blockedUserIds(userId, db);
  const rows = await db
    .select({
      id: users.id,
      handle: users.handle,
      displayName: users.displayName,
      schoolId: users.schoolId,
    })
    .from(studyGroupMembers)
    .innerJoin(users, eq(users.id, studyGroupMembers.userId))
    .where(and(eq(studyGroupMembers.groupId, groupId), isNotNull(users.verifiedAt)));

  // A block hides both ways, here as everywhere. The member still counts in
  // `listGroupsForSection`; they are simply not named to this person.
  return rows.filter((row) => !blocked.includes(row.id));
}

/**
 * Make a group for a class, and join it in the same breath.
 *
 * Creating one you are not then in would be a thing you own and cannot see,
 * which is nobody's idea of a study group.
 */
export async function createStudyGroup(
  userId: string,
  sectionId: number,
  rawName: string,
  db: Db = getDb(),
): Promise<StudyGroupResult> {
  const name = rawName.trim().replace(/\s+/g, " ");
  if (!name) return { ok: false, error: "Give the group a name." };
  if (name.length > STUDY_GROUP_NAME_MAX) {
    return { ok: false, error: `Keep the name under ${STUDY_GROUP_NAME_MAX} characters.` };
  }
  if (!(await isEnrolled(userId, sectionId, db))) {
    return { ok: false, error: "You can only start a group for a class you are in." };
  }

  // A section full of one-person groups helps nobody find anybody, so somebody
  // who already has a group here is pointed at it rather than allowed another.
  const existing = await db
    .select({ id: studyGroups.id })
    .from(studyGroups)
    .innerJoin(studyGroupMembers, eq(studyGroupMembers.groupId, studyGroups.id))
    .where(and(eq(studyGroups.sectionId, sectionId), eq(studyGroupMembers.userId, userId)))
    .limit(1);
  if (existing.length) {
    return { ok: false, error: "You are already in a group for this class." };
  }

  const [group] = await db
    .insert(studyGroups)
    .values({ sectionId, name, createdById: userId })
    .returning({ id: studyGroups.id });

  await db.insert(studyGroupMembers).values({ groupId: group.id, userId });
  return { ok: true, groupId: group.id };
}

/** Join a group, if it is for a class you are in. */
export async function joinStudyGroup(
  userId: string,
  groupId: number,
  db: Db = getDb(),
): Promise<StudyGroupResult> {
  const [group] = await db
    .select({ id: studyGroups.id, sectionId: studyGroups.sectionId })
    .from(studyGroups)
    .where(eq(studyGroups.id, groupId))
    .limit(1);
  if (!group) return { ok: false, error: "That group is gone." };

  if (!(await isEnrolled(userId, group.sectionId, db))) {
    return { ok: false, error: "That group is for a class you are not in." };
  }

  await db
    .insert(studyGroupMembers)
    .values({ groupId, userId })
    .onConflictDoNothing({ target: [studyGroupMembers.groupId, studyGroupMembers.userId] });
  return { ok: true, groupId };
}

/**
 * Leave. Takes effect at once, which is the half of the consent that makes the
 * other half honest.
 *
 * The last member out takes the group with them. An empty group is a name in a
 * list that anybody can join and nobody is in, and it would sit in the section
 * forever — there is no maintenance window here to sweep it up later.
 */
export async function leaveStudyGroup(
  userId: string,
  groupId: number,
  db: Db = getDb(),
): Promise<StudyGroupResult> {
  await db
    .delete(studyGroupMembers)
    .where(and(eq(studyGroupMembers.groupId, groupId), eq(studyGroupMembers.userId, userId)));

  const remaining = await db
    .select({ userId: studyGroupMembers.userId })
    .from(studyGroupMembers)
    .where(eq(studyGroupMembers.groupId, groupId))
    .limit(1);
  if (!remaining.length) await db.delete(studyGroups).where(eq(studyGroups.id, groupId));

  return { ok: true };
}

/** The caller's own groups, for the home page. */
export interface MyStudyGroup {
  id: number;
  sectionId: number;
  name: string;
  memberCount: number;
}

export async function listMyGroups(userId: string, db: Db = getDb()): Promise<MyStudyGroup[]> {
  const mine = await db
    .select({ groupId: studyGroupMembers.groupId })
    .from(studyGroupMembers)
    .where(eq(studyGroupMembers.userId, userId));
  if (!mine.length) return [];

  const rows = await db
    .select({
      id: studyGroups.id,
      sectionId: studyGroups.sectionId,
      name: studyGroups.name,
      memberCount: sql<number>`count(${studyGroupMembers.userId})`.mapWith(Number),
    })
    .from(studyGroups)
    .leftJoin(studyGroupMembers, eq(studyGroupMembers.groupId, studyGroups.id))
    .where(
      inArray(
        studyGroups.id,
        mine.map((m) => m.groupId),
      ),
    )
    .groupBy(studyGroups.id);

  return rows.sort((a, b) => a.name.localeCompare(b.name));
}
