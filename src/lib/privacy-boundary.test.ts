/**
 * An architectural guard, not a behaviour test.
 *
 * The privacy rules hold because every read of `enrollments`, `meetings` and
 * `users` goes through `overlap/queries.ts` or `friends.ts`, where the checks
 * live. A screen that queries those tables directly would bypass the checks
 * while still typechecking and still passing every other test — so the import
 * itself is what gets policed here.
 *
 * This runs without a database, which is the point: it is the one privacy test
 * that cannot be skipped.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");

interface SourceFile {
  path: string;
  source: string;
}

function queriesSource(files: SourceFile[]): string {
  const queries = files.find((f) => f.path === join("src", "lib", "overlap", "queries.ts"));
  expect(queries, "overlap/queries.ts is missing").toBeDefined();
  return queries!.source;
}

/**
 * One exported function's own source.
 *
 * Slicing to the next `export` drags the *following* function's doc comment in
 * with it, so a neighbour that merely mentions meetings could fail a test
 * about this function — which is exactly what happened the first time a new
 * query was added next to `getClassmates`. Cutting at the trailing comment
 * makes each of these tests examine the thing it names and nothing else.
 */
function functionSource(body: string, name: string): string {
  const start = body.indexOf(`export async function ${name}`);
  if (start === -1) return "";
  const end = body.indexOf("\nexport ", start + 1);
  const slice = body.slice(start, end === -1 ? undefined : end);
  const trailingComment = slice.lastIndexOf("\n/**");
  return trailingComment === -1 ? slice : slice.slice(0, trailingComment);
}

/** The only modules allowed to read the sensitive tables. */
const ENFORCEMENT_POINTS = [
  join("src", "lib", "overlap", "queries.ts"),
  join("src", "lib", "friends.ts"),
  /*
   * Study groups. Added deliberately and not lightly — a third enforcement
   * point is a third place the rules can drift out of step with the other two.
   * It earns its place by needing `enrollments` for the one check the whole
   * feature rests on (you may only touch a group for a class you are in) and
   * `users` to name the members, and by never reading a meeting: the group's
   * free time is answered by `getStudyGroupNextGap` next door, which is
   * asserted below.
   */
  join("src", "lib", "study-groups.ts"),
];

/** Self-scoped writes and auth, which never read another user's rows. */
const SELF_SCOPED = [
  join("src", "lib", "account.ts"),
  join("src", "lib", "auth", "session.ts"),
  join("src", "lib", "schedule", "save.ts"),
  join("src", "lib", "db", "schema.ts"),
  join("src", "lib", "db", "index.ts"),
];

/**
 * Reads without a signed-in viewer. Each is allowed only because of what it
 * refuses to return, and each is asserted below rather than trusted:
 *
 *  - `invite.ts` returns a display name, and only for a discoverable user.
 *  - `stats.ts` returns a count and never a row.
 */
const ANONYMOUS_READS = [join("src", "lib", "invite.ts"), join("src", "lib", "stats.ts")];

/**
 * Reads for the operator rather than for a user.
 *
 * `admin/stats.ts` counts across every account, which no viewer-scoped query
 * is allowed to do. It earns that the same way `stats.ts` does — by returning
 * numbers and never a row — and it is gated behind a password that is not the
 * student sign-in. The assertion below is what keeps that true: the moment it
 * selects a name or an address it stops being a count and becomes a directory
 * of everyone who ever signed up.
 */
const OPERATOR_READS = [join("src", "lib", "admin", "stats.ts")];

/**
 * The tables a route or a component may not import.
 *
 * `studyGroupMembers` is on the list for the same reason the others are: who
 * is in a group is a fact about people, and reading it outside an enforcement
 * point would be a way to enumerate them without the enrolment check.
 */
const SENSITIVE_TABLES = ["enrollments", "meetings", "users", "studyGroupMembers"];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(full)) out.push(full);
  }
  return out;
}

function isAllowed(relPath: string): boolean {
  if (relPath.endsWith(".test.ts")) return true;
  return [...ENFORCEMENT_POINTS, ...SELF_SCOPED, ...ANONYMOUS_READS, ...OPERATOR_READS].some(
    (allowed) => relPath === allowed,
  );
}

describe("privacy boundary", () => {
  const files = walk(SRC).map((file) => ({
    path: relative(process.cwd(), file),
    source: readFileSync(file, "utf8"),
  }));

  it("finds source files to check", () => {
    expect(files.length).toBeGreaterThan(15);
  });

  it("keeps reads of enrollments, meetings and users out of routes and components", () => {
    const offenders: string[] = [];

    for (const file of files) {
      if (isAllowed(file.path)) continue;
      // An import of the table object from the schema is the tell.
      const importMatch = /import\s*\{([^}]*)\}\s*from\s*["'][^"']*db\/schema["']/s.exec(
        file.source,
      );
      if (!importMatch) continue;
      const imported = importMatch[1].split(",").map((s) => s.trim().split(/\s+as\s+/)[0]);
      const bad = imported.filter((name) => SENSITIVE_TABLES.includes(name));
      if (bad.length) offenders.push(`${file.path.split(sep).join("/")} imports ${bad.join(", ")}`);
    }

    expect(offenders).toEqual([]);
  });

  it("keeps the enforcement points where they are expected to be", () => {
    for (const enforcement of ENFORCEMENT_POINTS) {
      const found = files.find((f) => f.path === enforcement);
      expect(found, `${enforcement} is missing`).toBeDefined();
    }
  });

  it("never selects a meeting inside getClassmates", () => {
    const fn = functionSource(queriesSource(files), "getClassmates");
    expect(fn, "getClassmates is missing").not.toBe("");

    // Identity only: a classmate result must not touch the meetings table.
    expect(fn).not.toContain("meetings");
    expect(fn).not.toContain("location");
    expect(fn).not.toContain("startMin");
  });

  /**
   * The request-context read. It is allowed to answer without the friend graph
   * — the whole point is that these two are *not* friends yet — so what keeps
   * it honest is the other two fences: it may only look inside the caller's
   * own sections, and it may not select a time or a room.
   */
  it("keeps getSharedSectionsWith to the caller's own sections, and to identity", () => {
    const fn = functionSource(queriesSource(files), "getSharedSectionsWith");
    expect(fn, "getSharedSectionsWith is missing").not.toBe("");

    // No time and no room can come out of this path.
    expect(fn).not.toContain("meetings");
    expect(fn).not.toContain("location");
    expect(fn).not.toContain("startMin");

    // The candidate sections are the caller's own, and blocks are subtracted.
    expect(fn).toContain("eq(enrollments.userId, userId)");
    expect(fn).toContain("blockedUserIds(");
  });

  /**
   * Study groups are the one place free time crosses between people who are
   * not accepted friends, so the two fences that replace the friend check are
   * asserted rather than trusted: membership is checked on every read of the
   * group's week, and the module that owns membership never reads a meeting.
   */
  it("gates a study group's free time on membership, and keeps times out of study-groups.ts", () => {
    const gap = functionSource(queriesSource(files), "getStudyGroupNextGap");
    expect(gap, "getStudyGroupNextGap is missing").not.toBe("");
    expect(gap).toContain("isGroupMember(");

    const groups = files.find((f) => f.path === join("src", "lib", "study-groups.ts"));
    expect(groups, "study-groups.ts is missing").toBeDefined();

    // Membership and names only. Every question about time is asked next door.
    const imported = /import\s*\{([^}]*)\}\s*from\s*["'][^"']*db\/schema["']/s.exec(
      groups!.source,
    );
    const names = (imported?.[1] ?? "").split(",").map((s) => s.trim());
    expect(names).not.toContain("meetings");
    expect(groups!.source).not.toContain("startMin");

    // And the enrolment check the whole feature rests on is really there.
    expect(groups!.source).toContain("eq(enrollments.userId, userId)");
  });

  it("gates every friends-only read on areFriends or friendIds", () => {
    const queries = files.find((f) => f.path === join("src", "lib", "overlap", "queries.ts"));
    const body = queries!.source;

    for (const fn of ["getSharedGapsWith", "getFreeNow", "getFriendsWithNextGap"]) {
      const start = body.indexOf(`export async function ${fn}`);
      expect(start, `${fn} is missing`).toBeGreaterThan(-1);
      const end = body.indexOf("\nexport ", start + 1);
      const source = body.slice(start, end === -1 ? undefined : end);
      expect(
        /areFriends\(|friendIds\(|getSharedGapsWith\(/.test(source),
        `${fn} must gate on the friend graph`,
      ).toBe(true);
    }
  });

  it("keeps the anonymous reads to what justifies them", () => {
    // stats.ts may count. The moment it selects a column it stops being an
    // aggregate and becomes a directory of everyone with an account.
    const stats = files.find((f) => f.path === join("src", "lib", "stats.ts"));
    expect(stats, "stats.ts is missing").toBeDefined();
    expect(stats!.source).toContain("count(*)");
    for (const column of ["users.handle", "users.displayName", "users.email", "users.id"]) {
      expect(stats!.source, `stats.ts must not select ${column}`).not.toContain(column);
    }

    // invite.ts may name a person, but only one who opted in to being seen.
    const invite = files.find((f) => f.path === join("src", "lib", "invite.ts"));
    expect(invite, "invite.ts is missing").toBeDefined();
    expect(invite!.source).toContain("eq(users.discoverable, true)");
    expect(invite!.source).not.toContain("users.email");
  });

  it("keeps the admin dashboard to counts", () => {
    const stats = files.find((f) => f.path === join("src", "lib", "admin", "stats.ts"));
    expect(stats, "admin/stats.ts is missing").toBeDefined();
    expect(stats!.source).toContain("count(*)");

    /*
     * The identity carriers. `users.id` is deliberately not on this list: it
     * appears in join and correlation predicates, which project nothing. A
     * name or an address appearing at all would mean a row is being returned.
     */
    for (const column of ["users.handle", "users.displayName", "users.email"]) {
      expect(stats!.source, `admin/stats.ts must not read ${column}`).not.toContain(column);
    }
  });

  it("has no 'who viewed your profile', proximity or streak features", () => {
    const banned = /viewedBy|profileViews|whoViewed|lastSeenAt|proximity|streakCount/i;
    const offenders = files
      .filter((f) => !f.path.endsWith(".test.ts") && banned.test(f.source))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });
});
