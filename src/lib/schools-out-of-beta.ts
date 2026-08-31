/**
 * Which schools are no longer in beta.
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  THIS IS THE SWITCH. Edit the list below and nothing else.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Every live school shows a "beta" tag next to its name until its id appears
 * here. Adding one line removes the tag everywhere it is drawn — the
 * universities page, the paste screen, the sign-in screen — because they all
 * read it from here.
 *
 * To take a school out of beta:
 *
 *     export const OUT_OF_BETA: readonly string[] = ["waterloo", "mcmaster"];
 *
 * The ids are the ones in `schools.ts`: waterloo, laurier, toronto, western,
 * mcmaster, queens, ubc, york, guelphhumber, brock.
 *
 * An id that matches no school is ignored rather than throwing, so a typo
 * costs you a tag that did not disappear and never a broken page. The test in
 * `schools.test.ts` will catch it.
 *
 * ── When a school has earned it ──────────────────────────────────────────
 *
 * Beta here means one specific thing: **nobody has proved Honk can read that
 * portal.** It is not about user numbers or polish. The bar is
 *
 *   1. a real paste from a real student there,
 *   2. which the parser read correctly, start to finish,
 *   3. saved as a test in `parsers/generic.test.ts` or `quest/parse.test.ts`.
 *
 * Waterloo is out of beta because Quest has been through all three. Nowhere
 * else has yet — every other school's format is inferred from its portal's
 * documentation, which is exactly where Quest was before somebody pasted into
 * it, and that went about as well as it sounds.
 *
 * Taking a school out of beta before step 3 is not optimism, it is a promise
 * to a student that their timetable will be read correctly, made on their
 * behalf, with nothing behind it.
 */

export const OUT_OF_BETA: readonly string[] = ["waterloo", "laurier"];

export function isOutOfBeta(schoolId: string): boolean {
  return OUT_OF_BETA.includes(schoolId);
}
