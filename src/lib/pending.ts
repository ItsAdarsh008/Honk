/**
 * The parsed schedule, held in the browser between pasting and signing in.
 *
 * The raw paste never reaches the server. What is stored here is the parsed
 * result the user has already reviewed on screen, and it is sent only after
 * they choose to save it.
 *
 * `localStorage`, not `sessionStorage`, because of how long sign-in can take.
 * A code can be tens of minutes behind the request while the sending domain is
 * still being throttled, and a student who gives up on the tab and comes back
 * later would otherwise find their schedule gone and have to paste again —
 * losing them at exactly the point they had already done the work. It is
 * cleared the moment the schedule is saved.
 */

import type { ParseResult } from "./quest/parse";

const KEY = "honk.pending-schedule";

export type PendingSchedule = Pick<ParseResult, "courses" | "termCode">;

export function savePending(result: PendingSchedule): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(result));
  } catch {
    // Private mode, or storage is full. The user can paste again.
  }
}

export function readPending(): PendingSchedule | null {
  if (typeof window === "undefined") return null;
  try {
    // sessionStorage is the old home; check it so a paste made mid-upgrade
    // is not stranded.
    const raw = window.localStorage.getItem(KEY) ?? window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingSchedule;
    if (!parsed?.courses?.length || !parsed.termCode) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearPending(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
    window.sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to do.
  }
}
