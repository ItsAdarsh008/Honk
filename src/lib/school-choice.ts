/**
 * Which school the person at the keyboard says they go to, before there is an
 * account to ask.
 *
 * Signed in, the school is the account's and this is never consulted. Signed
 * out, the paste screen has to show *some* set of instructions, and showing
 * Quest's to a Brock student is the fastest way to make them think Honk is not
 * for them. Remembered in the browser so coming back does not ask again.
 *
 * It only ever decides which instructions to print and which parser to try
 * first — never what gets saved. The account's own school decides that, on the
 * server, from the address that created it.
 */

import { DEFAULT_SCHOOL_ID, getSchool, type School } from "./schools";

const KEY = "honk.school";

export function readSchoolChoice(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const id = window.localStorage.getItem(KEY);
    return id && getSchool(id)?.status === "live" ? id : null;
  } catch {
    return null;
  }
}

export function saveSchoolChoice(id: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, id);
  } catch {
    // Private mode. The picker still works for this visit.
  }
}

/** The school to show, given an account's school and what the browser remembers. */
export function resolveSchool(accountSchoolId: string | null): School {
  const id = accountSchoolId ?? readSchoolChoice() ?? DEFAULT_SCHOOL_ID;
  return getSchool(id) ?? getSchool(DEFAULT_SCHOOL_ID)!;
}
