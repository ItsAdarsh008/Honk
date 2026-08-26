/**
 * Course colours.
 *
 * There are six pastels and a typical student takes five courses, so picking
 * by hash alone collides most of the time — two courses landing on the same
 * pastel makes the grid harder to read, which is the one thing the reveal
 * screen cannot afford.
 *
 * So: start from the hash, then probe forward for a free slot. Courses keep
 * their hashed colour wherever there is no contention, the assignment is
 * deterministic for a given set of courses, and no two courses in the same
 * schedule share a colour until there are more than six of them.
 */

export const COURSE_COLOR_COUNT = 6;

/** Stable hash of a course code, used as the preferred starting colour. */
export function colorSeedFor(subject: string, catalog: string): number {
  const key = `${subject} ${catalog}`;
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return hash % COURSE_COLOR_COUNT;
}

/** "CS 135" -> 1..6, for every course in one schedule. */
export function assignCourseColors(courseKeys: string[]): Record<string, number> {
  // Sorted so the result depends on the set of courses, not the order they
  // happen to arrive in from a query.
  const keys = [...new Set(courseKeys)].sort();
  const taken = new Set<number>();
  const out: Record<string, number> = {};

  for (const key of keys) {
    const [subject, catalog = ""] = key.split(" ");
    const seed = colorSeedFor(subject, catalog);
    let slot = seed;
    for (let step = 0; step < COURSE_COLOR_COUNT; step += 1) {
      const candidate = (seed + step) % COURSE_COLOR_COUNT;
      if (!taken.has(candidate)) {
        slot = candidate;
        break;
      }
    }
    // Past six courses the palette wraps and collisions are unavoidable.
    taken.add(slot);
    out[key] = slot + 1;
  }

  return out;
}
