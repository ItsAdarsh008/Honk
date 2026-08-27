/**
 * Postgres integration tests. These encode the privacy rules from SPEC §6 —
 * what a non-friend, a non-discoverable user and a blocked user cannot see.
 *
 * They run only when DATABASE_URL is set:
 *
 *     DATABASE_URL=postgres://... npm test
 *
 * Every test works inside its own uniquely-named data so the suite can run
 * against a database that already has rows in it, and cleans up after itself.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, inArray } from "drizzle-orm";
import * as schema from "../db/schema";
import { courses, enrollments, friendships, meetings, sections, users } from "../db/schema";
import { acceptFriend, blockUser, listIncomingRequests, requestFriend, unblockUser } from "../friends";
import { saveSchedule } from "../schedule/save";
import { schoolOrDefault } from "../schools";
import {
  getClassmates,
  getFreeNow,
  getFriendsWithNextGap,
  getMyClassesWithCounts,
  getMySchedule,
  getSharedGapsWith,
  getVisibleProfile,
} from "./queries";

const DATABASE_URL = process.env.DATABASE_URL;
const describeDb = DATABASE_URL ? describe : describe.skip;

const at = (h: number, m = 0) => h * 60 + m;

/** A term code nobody else will be using. */
const TERM = "9999";

/** These fixtures are all at one school; the cross-school case is below. */
const SCHOOL = "waterloo";

describeDb("privacy rules (Postgres)", () => {
  let sql: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  const userIds: string[] = [];

  /** ana and ben share CS 999 LEC 001. cass is in the same course, other section. */
  let ana = "";
  let ben = "";
  let cass = "";
  let lecSectionId = 0;
  let otherSectionId = 0;

  async function makeUser(
    name: string,
    discoverable: boolean,
    schoolId: string = SCHOOL,
  ): Promise<string> {
    const [row] = await db
      .insert(users)
      .values({
        email: `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@${schoolOrDefault(schoolId).canonicalDomain}`,
        displayName: name,
        handle: `${name}${Math.random().toString(36).slice(2, 8)}`,
        schoolId,
        discoverable,
        verifiedAt: new Date(),
      })
      .returning({ id: users.id });
    userIds.push(row.id);
    return row.id;
  }

  beforeAll(async () => {
    sql = postgres(DATABASE_URL!, { max: 2 });
    db = drizzle(sql, { schema });

    ana = await makeUser("ana", true);
    ben = await makeUser("ben", true);
    cass = await makeUser("cass", false);

    // ana: CS 999 LEC 001, Mon 10:00-11:00.
    await saveSchedule(
      ana,
      SCHOOL,
      {
        termCode: TERM,
        courses: [
          {
            subject: "ZZ",
            catalog: "999",
            title: "Privacy Test Course",
            status: "enrolled",
            sections: [
              {
                classNumber: 99001,
                sectionCode: "001",
                component: "LEC",
                instructor: "A Prof",
                startDate: "2026-09-08",
                endDate: "2026-12-02",
                meetings: [{ weekday: 1, startMin: at(10), endMin: at(11), location: "MC 4020" }],
              },
            ],
          },
        ],
      },
      db,
    );

    // ben: the same section, plus a second class ana does not have.
    await saveSchedule(
      ben,
      SCHOOL,
      {
        termCode: TERM,
        courses: [
          {
            subject: "ZZ",
            catalog: "999",
            title: "Privacy Test Course",
            status: "enrolled",
            sections: [
              {
                classNumber: 99001,
                sectionCode: "001",
                component: "LEC",
                instructor: "A Prof",
                startDate: "2026-09-08",
                endDate: "2026-12-02",
                meetings: [{ weekday: 1, startMin: at(10), endMin: at(11), location: "MC 4020" }],
              },
              {
                classNumber: 99003,
                sectionCode: "002",
                component: "TUT",
                instructor: null,
                startDate: "2026-09-08",
                endDate: "2026-12-02",
                meetings: [{ weekday: 1, startMin: at(14), endMin: at(15), location: "MC 4021" }],
              },
            ],
          },
        ],
      },
      db,
    );

    // cass: same course, different section, and not discoverable.
    await saveSchedule(
      cass,
      SCHOOL,
      {
        termCode: TERM,
        courses: [
          {
            subject: "ZZ",
            catalog: "999",
            title: "Privacy Test Course",
            status: "enrolled",
            sections: [
              {
                classNumber: 99002,
                sectionCode: "002",
                component: "LEC",
                instructor: "B Prof",
                startDate: "2026-09-08",
                endDate: "2026-12-02",
                meetings: [{ weekday: 1, startMin: at(12), endMin: at(13), location: "RCH 101" }],
              },
            ],
          },
        ],
      },
      db,
    );

    const rows = await db.select().from(sections).where(eq(sections.termCode, TERM));
    lecSectionId = rows.find((r) => r.classNumber === 99001)!.id;
    otherSectionId = rows.find((r) => r.classNumber === 99002)!.id;
  });

  afterAll(async () => {
    if (!sql) return;
    if (userIds.length) await db.delete(users).where(inArray(users.id, userIds));
    const sectionRows = await db.select({ id: sections.id }).from(sections).where(eq(sections.termCode, TERM));
    const ids = sectionRows.map((r) => r.id);
    if (ids.length) {
      await db.delete(meetings).where(inArray(meetings.sectionId, ids));
      await db.delete(sections).where(inArray(sections.id, ids));
    }
    await db.delete(courses).where(eq(courses.subject, "ZZ"));
    await sql.end();
  });

  it("shares one section row between two students in the same lecture", async () => {
    const rows = await db.select().from(enrollments).where(eq(enrollments.sectionId, lecSectionId));
    const ids = rows.map((r) => r.userId);
    expect(ids).toContain(ana);
    expect(ids).toContain(ben);
    expect(rows).toHaveLength(2);
  });

  it("shows a classmate's identity but no meeting, room or time", async () => {
    const classmates = await getClassmates(ana, lecSectionId, db);
    const found = classmates.find((c) => c.id === ben);
    expect(found).toBeDefined();
    // The shape itself carries no schedule: assert there is nowhere to hide one.
    expect(Object.keys(found!).sort()).toEqual([
      "displayName",
      "handle",
      "id",
      "relationship",
      "schoolId",
    ]);
    expect(JSON.stringify(classmates)).not.toContain("MC 4020");
  });

  it("leaves a user who has not opted in out of the class roster", async () => {
    // cass is in the same course but a different section, and not discoverable.
    const classmates = await getClassmates(cass, otherSectionId, db);
    expect(classmates.map((c) => c.id)).not.toContain(cass);

    const anaSees = await getClassmates(ana, lecSectionId, db);
    expect(anaSees.map((c) => c.id)).not.toContain(cass);
  });

  it("counts a non-discoverable classmate in the aggregate but not the visible count", async () => {
    const quiet = await makeUser("quiet", false);
    await db.insert(enrollments).values({ userId: quiet, sectionId: lecSectionId, termCode: TERM });

    const classes = await getMyClassesWithCounts(ana, TERM, db);
    const lec = classes.find((c) => c.sectionId === lecSectionId)!;
    expect(lec.otherCount).toBe(2); // ben + quiet
    expect(lec.visibleCount).toBe(1); // ben only

    await db.delete(users).where(eq(users.id, quiet));
  });

  it("refuses to show the roster of a class you are not in", async () => {
    // ana is not enrolled in cass's section.
    expect(await getClassmates(ana, otherSectionId, db)).toEqual([]);
  });

  it("returns null shared gaps for a non-friend rather than an empty week", async () => {
    // Null means "not allowed"; an empty week would mean "no free time".
    expect(await getSharedGapsWith(ana, ben, TERM, db)).toBeNull();
  });

  it("returns shared gaps once a request is accepted", async () => {
    await requestFriend(ana, ben, db);
    const incoming = await listIncomingRequests(ben, db);
    expect(incoming.map((r) => r.profile.id)).toContain(ana);

    await acceptFriend(ben, ana, db);

    const week = await getSharedGapsWith(ana, ben, TERM, db);
    expect(week).not.toBeNull();
    // Monday: ana busy 10-11, ben busy 10-11 and 14-15.
    expect(week![1]).toEqual([
      { start: at(8), end: at(10) },
      { start: at(11), end: at(14) },
      { start: at(15), end: at(22) },
    ]);
  });

  it("keeps 'free right now' to accepted friends only", async () => {
    // Monday 11:30: ana and ben are both free, cass is not a friend.
    const free = await getFreeNow(ana, TERM, { weekday: 1, minute: at(11, 30) }, db);
    expect(free.map((f) => f.profile.id)).toEqual([ben]);
    expect(free[0].until).toBe(at(14));

    const forCass = await getFreeNow(cass, TERM, { weekday: 1, minute: at(11, 30) }, db);
    expect(forCass).toEqual([]);
  });

  it("reports nobody free while the viewer is in class", async () => {
    // Monday 10:30: ana is in her lecture, so there is no shared window at all.
    expect(await getFreeNow(ana, TERM, { weekday: 1, minute: at(10, 30) }, db)).toEqual([]);
  });

  it("makes a block mutual, silent and immediate", async () => {
    await blockUser(ana, ben, db);

    // Neither can reach the other through any path.
    expect(await getSharedGapsWith(ana, ben, TERM, db)).toBeNull();
    expect(await getSharedGapsWith(ben, ana, TERM, db)).toBeNull();
    expect(await getFreeNow(ben, TERM, { weekday: 1, minute: at(11, 30) }, db)).toEqual([]);
    expect((await getClassmates(ana, lecSectionId, db)).map((c) => c.id)).not.toContain(ben);
    expect((await getClassmates(ben, lecSectionId, db)).map((c) => c.id)).not.toContain(ana);
    expect(await getVisibleProfile(ben, ana, db)).toBeNull();
    expect(await getFriendsWithNextGap(ana, TERM, { weekday: 1, minute: at(9) }, db)).toEqual([]);

    // Silent: the blocked party is told nothing, and a request from them
    // looks exactly like a request that went through.
    const result = await requestFriend(ben, ana, db);
    expect(result).toEqual({ ok: true, status: "request_sent" });
    expect(await listIncomingRequests(ana, db)).toEqual([]);

    await unblockUser(ana, ben, db);
    const [row] = await db
      .select()
      .from(friendships)
      .where(eq(friendships.userAId, ana < ben ? ana : ben));
    expect(row).toBeUndefined();
  });

  it("keeps a user's own rooms and times visible to themselves", async () => {
    const mine = await getMySchedule(ana, TERM, db);
    expect(mine).toHaveLength(1);
    expect(mine[0].sections[0].meetings[0].location).toBe("MC 4020");
  });

  it("is idempotent: pasting the same schedule twice leaves one enrollment", async () => {
    await saveSchedule(
      ana,
      SCHOOL,
      {
        termCode: TERM,
        courses: [
          {
            subject: "ZZ",
            catalog: "999",
            title: "Privacy Test Course",
            status: "enrolled",
            sections: [
              {
                classNumber: 99001,
                sectionCode: "001",
                component: "LEC",
                instructor: "A Prof",
                startDate: "2026-09-08",
                endDate: "2026-12-02",
                meetings: [{ weekday: 1, startMin: at(10), endMin: at(11), location: "MC 4020" }],
              },
            ],
          },
        ],
      },
      db,
    );
    const rows = await db.select().from(enrollments).where(eq(enrollments.userId, ana));
    expect(rows).toHaveLength(1);
  });

  /* ------------------------------------------------------------------ *
   * Across universities
   * ------------------------------------------------------------------ */

  it("keeps two schools' identically-named courses apart", async () => {
    // Same subject, same catalog number, same term, different school. These
    // must not become one row — that would put a McMaster student in a
    // Waterloo lecture, which is the one thing the roster must never do.
    const mac = await makeUser("mac", true, "mcmaster");

    await saveSchedule(
      mac,
      "mcmaster",
      {
        termCode: TERM,
        courses: [
          {
            subject: "ZZ",
            catalog: "999",
            title: "A Different Course With The Same Code",
            status: "enrolled",
            sections: [
              {
                classNumber: 99001,
                sectionCode: "001",
                component: "LEC",
                instructor: "Another Prof",
                startDate: "2026-09-08",
                endDate: "2026-12-02",
                meetings: [{ weekday: 1, startMin: at(10), endMin: at(11), location: "BSB 108" }],
              },
            ],
          },
        ],
      },
      db,
    );

    const macClasses = await getMyClassesWithCounts(mac, TERM, db);
    expect(macClasses).toHaveLength(1);
    // ana is in "the same" class at Waterloo and must not be counted here.
    expect(macClasses[0].otherCount).toBe(0);
    expect(macClasses[0].sectionId).not.toBe(lecSectionId);

    const anaClasses = await getMyClassesWithCounts(ana, TERM, db);
    const anaLec = anaClasses.find((c) => c.sectionId === lecSectionId);
    expect(anaLec?.otherCount).toBe(1); // ben, and only ben.

    // And no roster leak in either direction.
    const roster = await getClassmates(mac, macClasses[0].sectionId, db);
    expect(roster.map((p) => p.id)).not.toContain(ana);
  });

  it("still finds shared free time between two universities", async () => {
    // The point of the whole change: friends across campuses see each other's
    // gaps even though they can never share a class.
    const mac = await makeUser("macfriend", true, "mcmaster");

    await saveSchedule(
      mac,
      "mcmaster",
      {
        termCode: TERM,
        courses: [
          {
            subject: "YY",
            catalog: "111",
            title: "Mac Only",
            status: "enrolled",
            sections: [
              {
                classNumber: 88001,
                sectionCode: "C01",
                component: "LEC",
                instructor: null,
                startDate: "2026-09-08",
                endDate: "2026-12-02",
                meetings: [{ weekday: 1, startMin: at(13), endMin: at(14), location: null }],
              },
            ],
          },
        ],
      },
      db,
    );

    await requestFriend(ana, mac, db);
    await acceptFriend(mac, ana, db);

    const week = await getSharedGapsWith(ana, mac, TERM, db);
    expect(week).not.toBeNull();
    // ana is busy 10-11, mac 13-14; both are free in between.
    expect(week![1]).toContainEqual({ start: at(11), end: at(13) });

    const profile = await getVisibleProfile(ana, mac, db);
    expect(profile?.schoolId).toBe("mcmaster");
    expect(profile?.sharedSectionCount).toBe(0);
  });
});