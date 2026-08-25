"use client";

/**
 * The actions on someone's profile.
 *
 * Block is one tap with no dialog — the undo toast is the confirmation, which
 * is the right trade when the thing you are blocking is a person you would
 * rather not think about for another two clicks. Blocks are silent: nothing
 * here tells the other side anything happened.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RelationshipState } from "@/lib/friends";
import { friendAction } from "./PersonRow";

export function ProfileActions({
  userId,
  name,
  relationship,
}: {
  userId: string;
  name: string;
  relationship: RelationshipState;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<RelationshipState>(relationship);
  const [undo, setUndo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = (action: Parameters<typeof friendAction>[0], next: RelationshipState) => {
    const previous = state;
    setState(next);
    setError(null);
    startTransition(async () => {
      const message = await friendAction(action, userId);
      if (message) {
        setState(previous);
        setError(message);
        return;
      }
      router.refresh();
    });
  };

  const block = () => {
    run("block", "blocked");
    setUndo(true);
    window.setTimeout(() => setUndo(false), 8000);
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {state === "none" && (
          <button className="btn btn-primary" disabled={pending} onClick={() => run("request", "request_sent")}>
            Add {name.split(" ")[0]}
          </button>
        )}
        {state === "request_sent" && (
          <button className="btn btn-secondary" disabled={pending} onClick={() => run("remove", "none")}>
            Requested — cancel
          </button>
        )}
        {state === "request_received" && (
          <>
            <button className="btn btn-primary" disabled={pending} onClick={() => run("accept", "friends")}>
              Accept
            </button>
            <button className="btn btn-quiet" disabled={pending} onClick={() => run("remove", "none")}>
              Ignore
            </button>
          </>
        )}
        {state === "friends" && (
          <button className="btn btn-secondary" disabled={pending} onClick={() => run("remove", "none")}>
            Remove friend
          </button>
        )}

        {state !== "blocked" && (
          <button className="btn btn-quiet" disabled={pending} onClick={block}>
            Block
          </button>
        )}
        {state === "blocked" && (
          <button className="btn btn-secondary" disabled={pending} onClick={() => run("unblock", "none")}>
            Unblock
          </button>
        )}
      </div>

      {error && (
        <p className="mt-2 text-[14px] text-[#a8442c] dark:text-[#e08b6f]" role="alert">
          {error}
        </p>
      )}

      {undo && (
        <div className="toast" role="status">
          <span>Blocked. They can't see you, and they aren't told.</span>
          <button
            onClick={() => {
              setUndo(false);
              run("unblock", "none");
            }}
          >
            Undo
          </button>
        </div>
      )}
    </>
  );
}
