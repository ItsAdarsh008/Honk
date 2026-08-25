import "server-only";

/**
 * Reading the session without insisting a database exists.
 *
 * The paste flow is shippable on its own with no persistence at all, so every
 * screen degrades to "signed out" rather than crashing when DATABASE_URL is
 * unset or unreachable.
 */

import { hasDatabase } from "../db";
import { getCurrentUser } from "./session";
import type { User } from "../db/schema";

export async function getOptionalUser(): Promise<User | null> {
  if (!hasDatabase()) return null;
  try {
    return await getCurrentUser();
  } catch {
    return null;
  }
}
