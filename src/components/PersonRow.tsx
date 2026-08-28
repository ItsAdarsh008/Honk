"use client";

/**
 * One person, wherever they appear: a class roster, the friends list, a
 * pending request. The action on the right is whatever the relationship makes
 * available next, so there is one thing to tap and no menus to learn.
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { RelationshipState } from "@/lib/friends";
import { getSchool } from "@/lib/schools";

export interface Person {
  id: string;
  handle: string | null;
  displayName: string | null;
  schoolId?: string;
  relationship: RelationshipState;
}

export type FriendAction = "request" | "accept" | "remove" | "block" | "unblock";

export async function friendAction(action: FriendAction, userId: string): Promise<string | null> {
  try {
    const response = await fetch("/api/friends", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, userId }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      return body.error ?? "That didn't work.";
    }
    return null;
  } catch {
    return "That didn't work. Check your connection.";
  }
}

export function PersonRow({
  person,
  trailing,
  viewerSchoolId,
}: {
  person: Person;
  /** Replaces the action button — used for "free until 2:00" and gap times. */
  trailing?: React.ReactNode;
  /** The viewer's school, so only a *different* one gets labelled. */
  viewerSchoolId?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<RelationshipState>(person.relationship);
  const [error, setError] = useState<string | null>(null);

  const run = (action: FriendAction, next: RelationshipState) => {
    setError(null);
    const previous = state;
    setState(next);
    startTransition(async () => {
      const message = await friendAction(action, person.id);
      if (message) {
        setState(previous);
        setError(message);
        return;
      }
      router.refresh();
    });
  };

  const name = person.displayName ?? "Someone";
  /*
   * Only when it differs from the viewer's. On your own campus every row
   * would say the same word, which is noise; on a mixed list it is the thing
   * that explains why you share no classes with somebody you are friends with.
   */
  const elsewhere =
    person.schoolId && viewerSchoolId && person.schoolId !== viewerSchoolId
      ? getSchool(person.schoolId)
      : null;

  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        {person.handle ? (
          <Link
            href={`/u/${person.handle}`}
            className="block truncate text-[15px] font-medium hover:text-[var(--clay)]"
          >
            {name}
          </Link>
        ) : (
          <span className="block truncate text-[15px] font-medium">{name}</span>
        )}
        <span className="mono block truncate text-[12px] text-[var(--ink-faint)]">
          @{person.handle ?? "unknown"}
          {elsewhere && <span className="ml-1.5 text-[var(--ink-soft)]">{elsewhere.short}</span>}
        </span>
        {error && <span className="block text-[12px] text-[#a8442c]">{error}</span>}
      </div>

      {trailing ?? (
        <div className="shrink-0">
          {state === "none" && (
            <button
              className="btn btn-secondary px-3.5 py-2 text-[14px]"
              disabled={pending}
              onClick={() => run("request", "request_sent")}
            >
              Add
            </button>
          )}
          {state === "request_sent" && (
            <button
              className="btn btn-quiet px-3 py-2 text-[13px]"
              disabled={pending}
              onClick={() => run("remove", "none")}
              title="Cancel this request"
            >
              Requested
            </button>
          )}
          {state === "request_received" && (
            <div className="flex items-center gap-1">
              <button
                className="btn btn-primary px-3.5 py-2 text-[14px]"
                disabled={pending}
                onClick={() => run("accept", "friends")}
              >
                Accept
              </button>
              <button
                className="btn btn-quiet px-2.5 py-2 text-[13px]"
                disabled={pending}
                onClick={() => run("remove", "none")}
              >
                Ignore
              </button>
            </div>
          )}
          {state === "friends" && <span className="chip">friend</span>}
          {state === "blocked" && <span className="chip">blocked</span>}
        </div>
      )}
    </li>
  );
}
