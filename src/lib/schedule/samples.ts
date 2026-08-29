import "server-only";

/**
 * Keeping the pastes that did not work.
 *
 * A parser bug used to be unreportable. The student saw "Nothing readable in
 * there yet", closed the tab, and the paste that would have shown the bug went
 * with them — which is why nine of ten schools are still in beta and why the
 * fixtures in `parsers/generic.test.ts` are reconstructed from portal
 * documentation instead of from anything real.
 *
 * What gets kept is deliberately the smallest set that answers the question:
 *
 *  - **Beta schools only.** Waterloo's parser was built from a real paste and
 *    is out of beta; another Quest paste teaches nothing and is not kept.
 *  - **Failures only.** A clean read is not evidence of a bug. `pasteOutcome`
 *    returns null for it and nothing is written.
 *  - **No user, no IP.** Fixing a parser needs the text and the school. Linking
 *    the row to a person would buy nothing and cost a great deal.
 *  - **Ninety days**, purged on write rather than by a scheduler there is
 *    nowhere to run.
 *
 * The decision half is pure and lives above the database half, so the rule
 * about what is worth keeping is tested without a Postgres to hand.
 */

import { and, eq, gt, lt, sql } from "drizzle-orm";
import { getDb, type Db } from "../db";
import { pasteSamples } from "../db/schema";
import { schoolOrDefault } from "../schools";
import type { ParseWarning } from "./types";

/** How long a sample lives before the next write clears it out. */
export const SAMPLE_RETENTION_DAYS = 90;

/**
 * A ceiling on stored text, well above any real timetable.
 *
 * A paste is a page of a portal; the largest real one seen is a few kilobytes.
 * This is here so a pathological or hostile paste cannot write a megabyte a
 * time into the table, not to trim anything a student would actually send.
 */
export const MAX_SAMPLE_CHARS = 64_000;

/**
 * How many samples one school may contribute in a day.
 *
 * The paste screen works before sign-in — a student pastes, sees it fail, and
 * only then makes an account — so this endpoint has to accept unauthenticated
 * writes to catch the failures that matter most. That is a row somebody can
 * write without an account, which needs a ceiling. A real school produces a
 * handful of failures a day; two hundred is far above that and far below
 * anything that would matter.
 */
export const DAILY_CAP_PER_SCHOOL = 200;

export type PasteOutcome = "no_courses" | "warnings";

/**
 * What went wrong, or null if nothing did.
 *
 * "no_courses" is the loud failure the student actually sees. "warnings" is
 * the quiet one: the parser read something, so the screen looks fine, and a
 * class may still be missing or misplaced. The second kind is the reason this
 * does not simply record empty results.
 */
export function pasteOutcome(courseCount: number, warningCount: number): PasteOutcome | null {
  if (courseCount <= 0) return "no_courses";
  if (warningCount > 0) return "warnings";
  return null;
}

/** Whether this reading is worth keeping. Pure, so the rule is testable. */
export function shouldRecordPaste(
  schoolId: string,
  courseCount: number,
  warningCount: number,
): boolean {
  // An unknown id resolves to the default school, which is out of beta — so an
  // unrecognised school fails closed and records nothing.
  if (!schoolOrDefault(schoolId).beta) return false;
  return pasteOutcome(courseCount, warningCount) !== null;
}

export interface RecordSampleInput {
  schoolId: string;
  parser: string;
  rawText: string;
  courseCount: number;
  warnings: ParseWarning[];
}

/**
 * Write one failed paste, and clear out anything past its ninety days.
 *
 * Returns false when the rule said not to keep it, so the caller can stay a
 * single unconditional call.
 */
export async function recordPasteSample(
  input: RecordSampleInput,
  db: Db = getDb(),
): Promise<boolean> {
  const warningCount = input.warnings.length;
  if (!shouldRecordPaste(input.schoolId, input.courseCount, warningCount)) return false;

  const outcome = pasteOutcome(input.courseCount, warningCount);
  if (!outcome) return false;

  const [today] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(pasteSamples)
    .where(
      and(
        eq(pasteSamples.schoolId, input.schoolId),
        gt(pasteSamples.createdAt, sql`now() - '1 day'::interval`),
      ),
    );
  if ((today?.n ?? 0) >= DAILY_CAP_PER_SCHOOL) return false;

  await db.insert(pasteSamples).values({
    schoolId: input.schoolId,
    parser: input.parser,
    outcome,
    courseCount: Math.max(0, input.courseCount),
    warnings: input.warnings,
    rawText: input.rawText.slice(0, MAX_SAMPLE_CHARS),
  });

  await db
    .delete(pasteSamples)
    .where(lt(pasteSamples.createdAt, sql`now() - ${`${SAMPLE_RETENTION_DAYS} days`}::interval`));

  return true;
}
