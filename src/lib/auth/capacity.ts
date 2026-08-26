/**
 * The daily ceiling on sign-in emails.
 *
 * Resend's free tier stops at 100 messages a day. Left alone, the 101st
 * student sees "That didn't send" on a form that looks broken, which during
 * frosh week is indistinguishable from the app being down. So Honk counts its
 * own sends and refuses first, on its own terms: a calm card that says what
 * happened, keeps the pasted schedule, and gives a time to come back.
 *
 * `EMAIL_DAILY_CAP` raises it when the Resend plan changes. The window is a
 * rolling 24 hours rather than a calendar day — it is a hair more conservative
 * than the provider's own reset, which is the safe direction to be wrong in.
 */

import "server-only";
import { gt, sql } from "drizzle-orm";
import { getDb, type Db } from "../db";
import { loginCodes } from "../db/schema";
import { deliveryMode } from "./email";

export const DEFAULT_EMAIL_DAILY_CAP = 100;
export const CAP_WINDOW_MS = 24 * 60 * 60_000;

export function emailDailyCap(): number {
  const raw = Number(process.env.EMAIL_DAILY_CAP);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_EMAIL_DAILY_CAP;
}

/** Minutes until the oldest send ages out of the window and frees a slot. */
export function slotFreesInMinutes(oldest: Date, now: Date = new Date()): number {
  const freesAt = oldest.getTime() + CAP_WINDOW_MS;
  return Math.max(1, Math.ceil((freesAt - now.getTime()) / 60_000));
}

export type CapacityResult =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterMinutes: number };

/**
 * Whether there is room to send another code.
 *
 * Skipped entirely without a provider: in console mode the code is printed to
 * the terminal, so there is no quota to model and no reason to stop dev work
 * after a hundred sign-ins.
 */
export async function checkDailyCapacity(db: Db = getDb()): Promise<CapacityResult> {
  const cap = emailDailyCap();
  if (deliveryMode() === "console") return { ok: true, remaining: cap };

  const since = new Date(Date.now() - CAP_WINDOW_MS);
  const [row] = await db
    .select({
      count: sql<number>`count(*)`.mapWith(Number),
      oldest: sql<string | null>`min(${loginCodes.createdAt})`,
    })
    .from(loginCodes)
    .where(gt(loginCodes.createdAt, since));

  const used = row?.count ?? 0;
  if (used < cap) return { ok: true, remaining: cap - used };

  // postgres-js hands back a Date for timestamptz; tolerate a string either way.
  const oldest = row?.oldest ? new Date(row.oldest as unknown as string | Date) : since;
  return { ok: false, retryAfterMinutes: slotFreesInMinutes(oldest) };
}
