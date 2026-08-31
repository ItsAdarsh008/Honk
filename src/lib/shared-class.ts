/**
 * How an incoming friend request explains itself.
 *
 * Kept apart from the query that finds the classes so the wording can be
 * tested without a database, and structurally typed so it borrows nothing from
 * `overlap/queries.ts` — a formatter has no business importing the module that
 * enforces the privacy rules.
 */

/**
 * The classes a request came out of, in as few words as it takes.
 *
 * By course code, and deduplicated. Somebody in both the lecture and the
 * tutorial of one course is in *one* class with you, and "In your ECON 120 and
 * ECON 120" reads like a bug because it is one.
 *
 * Returns null when there is nothing to say, which is a real case: a request
 * can arrive from a shared profile link, from somebody who has since dropped
 * the class, or from a friend of a friend at another school. The row simply
 * goes back to being a name, rather than gaining a line that says nothing.
 */
export function sharedClassNote(shared: ReadonlyArray<{ code: string }>): string | null {
  const codes = [...new Set(shared.map((s) => s.code))];
  if (codes.length === 0) return null;
  if (codes.length === 1) return `In your ${codes[0]}`;
  if (codes.length === 2) return `In your ${codes[0]} and ${codes[1]}`;
  return `In your ${codes[0]}, ${codes[1]} and ${codes.length - 2} more`;
}
