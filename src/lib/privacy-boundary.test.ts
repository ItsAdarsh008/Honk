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

/** The only modules allowed to read the sensitive tables. */
const ENFORCEMENT_POINTS = [
  join("src", "lib", "overlap", "queries.ts"),
  join("src", "lib", "friends.ts"),
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

const SENSITIVE_TABLES = ["enrollments", "meetings", "users"];

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
  return [...ENFORCEMENT_POINTS, ...SELF_SCOPED, ...ANONYMOUS_READS].some(
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
    const queries = files.find((f) => f.path === join("src", "lib", "overlap", "queries.ts"));
    expect(queries).toBeDefined();

    const body = queries!.source;
    const start = body.indexOf("export async function getClassmates");
    expect(start).toBeGreaterThan(-1);
    const end = body.indexOf("\nexport ", start + 1);
    const fn = body.slice(start, end === -1 ? undefined : end);

    // Identity only: a classmate result must not touch the meetings table.
    expect(fn).not.toContain("meetings");
    expect(fn).not.toContain("location");
    expect(fn).not.toContain("startMin");
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

  it("has no 'who viewed your profile', proximity or streak features", () => {
    const banned = /viewedBy|profileViews|whoViewed|lastSeenAt|proximity|streakCount/i;
    const offenders = files
      .filter((f) => !f.path.endsWith(".test.ts") && banned.test(f.source))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });
});
