/**
 * The parsed schedule, held in the browser between pasting and signing in.
 *
 * The raw paste never reaches the server. What is stored here is the parsed
 * result the user has already reviewed on screen, and it is sent only after
 * they choose to save it.
 */

import type { ParseResult } from "./quest/parse";

const KEY = "honk.pending-schedule";

export type PendingSchedule = Pick<ParseResult, "courses" | "termCode">;

export function savePending(result: PendingSchedule): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(result));
  } catch {
    // Private mode, or storage is full. The user can paste again.
  }
}

export function readPending(): PendingSchedule | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
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
    window.sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to do.
  }
}
