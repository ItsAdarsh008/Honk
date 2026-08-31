"use client";

/**
 * Study groups, inside the roster you already opened.
 *
 * It lives here rather than on a page of its own because a study group is a
 * fact about one class, and this is the only screen where somebody is already
 * thinking about one class. A separate page would need to ask which class they
 * meant, which is a question they have just answered by tapping a block.
 *
 * The whole feature is three states — none yet, some to join, one you are in —
 * and it renders exactly one of them at a time. There is no group page, no
 * chat and no member management: what Honk knows that a group chat does not is
 * when all of you are free, and that is the one thing this shows.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export interface StudyGroupSummary {
  id: number;
  sectionId: number;
  name: string;
  memberCount: number;
  joined: boolean;
  createdByYou: boolean;
}

export interface StudyGroupMember {
  id: string;
  handle: string | null;
  displayName: string | null;
}

type State =
  | { status: "loading" }
  | { status: "ready"; groups: StudyGroupSummary[]; members: StudyGroupMember[] };

export function StudyGroupPanel({ sectionId, code }: { sectionId: number; code: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ status: "loading" });
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState(`${code} study group`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/study-groups?sectionId=${sectionId}`);
      const body = (await response.json().catch(() => ({}))) as {
        groups?: StudyGroupSummary[];
        members?: StudyGroupMember[];
      };
      setState({ status: "ready", groups: body.groups ?? [], members: body.members ?? [] });
    } catch {
      setState({ status: "ready", groups: [], members: [] });
    }
  }, [sectionId]);

  useEffect(() => {
    setNaming(false);
    setError(null);
    setName(`${code} study group`);
    setState({ status: "loading" });
    void load();
  }, [load, code]);

  const act = useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(true);
      setError(null);
      try {
        const response = await fetch("/api/study-groups", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!response.ok) {
          const failed = (await response.json().catch(() => ({}))) as { error?: string };
          setError(failed.error ?? "That didn't work.");
          return;
        }
        setNaming(false);
        await load();
        // The home page carries a list of these and the week it is free in.
        router.refresh();
      } catch {
        setError("That didn't work. Check your connection.");
      } finally {
        setBusy(false);
      }
    },
    [load, router],
  );

  if (state.status === "loading") {
    return <p className="text-[13px] text-[var(--ink-faint)]">Looking for study groups…</p>;
  }

  const mine = state.groups.find((group) => group.joined) ?? null;
  const others = state.groups.filter((group) => !group.joined);

  return (
    <div className="space-y-2 border-t border-[var(--border)] pt-3">
      <p className="section-label">Study group</p>

      {mine ? (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-[14px] font-medium">{mine.name}</span>
            <button
              className="btn btn-quiet px-2.5 py-1.5 text-[13px]"
              disabled={busy}
              onClick={() => void act({ action: "leave", groupId: mine.id })}
            >
              Leave
            </button>
          </div>
          <p className="text-[13px] text-[var(--ink-soft)]">
            {state.members.length > 0
              ? state.members.map((m) => m.displayName ?? "Someone").join(", ")
              : `${mine.memberCount} ${mine.memberCount === 1 ? "member" : "members"}`}
          </p>
          {mine.memberCount === 1 && (
            <p className="text-[13px] text-[var(--ink-faint)]">
              It&rsquo;s just you so far. Anyone in this section can join it.
            </p>
          )}
        </div>
      ) : (
        <>
          {others.map((group) => (
            <div key={group.id} className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="block truncate text-[14px] font-medium">{group.name}</span>
                <span className="mono text-[12px] text-[var(--ink-faint)]">
                  {group.memberCount} {group.memberCount === 1 ? "member" : "members"}
                </span>
              </div>
              <button
                className="btn btn-secondary shrink-0 px-3.5 py-2 text-[14px]"
                disabled={busy}
                onClick={() => void act({ action: "join", groupId: group.id })}
              >
                Join
              </button>
            </div>
          ))}

          {naming ? (
            <div className="space-y-2">
              <input
                className="field w-full"
                value={name}
                maxLength={60}
                autoFocus
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !busy) {
                    void act({ action: "create", sectionId, name });
                  }
                }}
                aria-label="Name for the study group"
              />
              <p className="text-[13px] text-[var(--ink-soft)]">
                Anyone in this section can join. Members can see when the whole group is free —
                nothing else, and you can leave any time.
              </p>
              <div className="flex gap-2">
                <button
                  className="btn btn-primary px-3.5 py-2 text-[14px]"
                  disabled={busy}
                  onClick={() => void act({ action: "create", sectionId, name })}
                >
                  Create it
                </button>
                <button
                  className="btn btn-quiet px-3 py-2 text-[13px]"
                  disabled={busy}
                  onClick={() => setNaming(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              className="btn btn-secondary px-3.5 py-2 text-[14px]"
              disabled={busy}
              onClick={() => setNaming(true)}
            >
              {others.length ? "Start another" : "Start a study group"}
            </button>
          )}
        </>
      )}

      {error && <p className="text-[13px] text-[#a8442c]">{error}</p>}
    </div>
  );
}
