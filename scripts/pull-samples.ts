/**
 * Pull the pastes that did not parse out of the database and onto disk.
 *
 *   npx vite-node scripts/pull-samples.ts [school] [--out dir] [--limit n]
 *
 * The other half of `diagnose-paste.ts`, which takes a file. This writes one
 * file per stored sample, so the loop for fixing a school is:
 *
 *   1. npx vite-node scripts/pull-samples.ts laurier
 *   2. npx vite-node scripts/diagnose-paste.ts paste-samples/laurier-14.txt laurier
 *   3. fix the parser, add the paste to generic.test.ts as a fixture
 *   4. add the school to OUT_OF_BETA once it reads start to finish
 *
 * Needs DATABASE_URL, so it reads production data. The files it writes contain
 * real students' timetables and names — they are ignored by git on purpose,
 * and a fixture built from one should have the name changed the way the Quest
 * fixture in `quest/parse.test.ts` was.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { desc, eq } from "drizzle-orm";
import { getDb, getSql, hasDatabase } from "../src/lib/db";
import { pasteSamples } from "../src/lib/db/schema";
import { LIVE_SCHOOLS } from "../src/lib/schools";

function flag(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const prevIsFlag = (a: string) => process.argv[process.argv.indexOf(a) - 1]?.startsWith("--");
const school = positional.find((a) => !prevIsFlag(a)) ?? null;

const outDir = flag("out", "paste-samples");
const limit = Number(flag("limit", "50"));

if (!hasDatabase()) {
  console.error("DATABASE_URL is not set. Point it at the database you want to read.");
  process.exit(2);
}

if (school && !LIVE_SCHOOLS.some((s) => s.id === school)) {
  console.error(`Unknown school "${school}".`);
  console.error(`schools: ${LIVE_SCHOOLS.map((s) => s.id).join(", ")}`);
  process.exit(2);
}

async function main() {
  const db = getDb();
  const rows = await db
    .select()
    .from(pasteSamples)
    .where(school ? eq(pasteSamples.schoolId, school) : undefined)
    .orderBy(desc(pasteSamples.createdAt))
    .limit(Number.isFinite(limit) ? limit : 50);

  if (!rows.length) {
    console.log(school ? `No stored samples for ${school}.` : "No stored samples.");
    return;
  }

  mkdirSync(outDir, { recursive: true });

  for (const row of rows) {
    const file = join(outDir, `${row.schoolId}-${row.id}.txt`);
    writeFileSync(file, row.rawText, "utf8");
    const when = row.createdAt.toISOString().slice(0, 10);
    const warnings = Array.isArray(row.warnings) ? row.warnings.length : 0;
    console.log(
      `${file}  ${when}  ${row.parser}  ${row.outcome}  ` +
        `${row.courseCount} course(s), ${warnings} warning(s)`,
    );
  }

  console.log(`\n${rows.length} sample(s) written to ${outDir}/`);
  console.log(`Next: npx vite-node scripts/diagnose-paste.ts ${outDir}/<file> <school>`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => getSql().end());
