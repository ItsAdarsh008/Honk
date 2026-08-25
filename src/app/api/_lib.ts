import "server-only";
import { NextResponse } from "next/server";
import { hasDatabase } from "@/lib/db";

export function json<T>(body: T, status = 200) {
  return NextResponse.json(body, { status });
}

export function fail(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

/** Coarse client IP, used only for rate limiting. Never stored with a schedule. */
export function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || null;
  return request.headers.get("x-real-ip");
}

/** Every route degrades to a plain message rather than a stack trace. */
export function requireDatabase() {
  if (hasDatabase()) return null;
  return fail("Honk isn't connected to a database yet, so this can't be saved.", 503);
}

export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}
