"use client";

/**
 * Settings: the privacy switch, the block list, and the two delete buttons.
 *
 * Deletes are hard, so each asks once inline rather than opening a dialog.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PublicProfile } from "@/lib/friends";
import { friendAction } from "./PersonRow";

interface Props {
  discoverable: boolean;
  blocked: PublicProfile[];
  hasSchedule: boolean;
}

export function SettingsPanel({ discoverable, blocked, hasSchedule }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [seen, setSeen] = useState(discoverable);
  const [confirming, setConfirming] = useState<"schedule" | "account" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggle = (next: boolean) => {
    setSeen(next);
    startTransition(async () => {
      const response = await fetch("/api/privacy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ discoverable: next }),
      }).catch(() => null);
      if (!response?.ok) {
        setSeen(!next);
        setError("That didn't save. Try again.");
        return;
      }
      router.refresh();
    });
  };

  const deleteSchedule = () => {
    startTransition(async () => {
      const response = await fetch("/api/schedule", { method: "DELETE" }).catch(() => null);
      setConfirming(null);
      if (!response?.ok) {
        setError("That didn't delete. Try again.");
        return;
      }
      router.push("/home");
      router.refresh();
    });
  };

  const deleteAccount = () => {
    startTransition(async () => {
      const response = await fetch("/api/account", { method: "DELETE" }).catch(() => null);
      setConfirming(null);
      if (!response?.ok) {
        setError("That didn't delete. Try again.");
        return;
      }
      router.push("/");
      router.refresh();
    });
  };

  const signOut = () => {
    startTransition(async () => {
      await fetch("/api/auth/signout", { method: "POST" }).catch(() => null);
      router.push("/");
      router.refresh();
    });
  };

  return (
    <div className="space-y-8">
      {error && (
        <p className="text-[14px] text-[#a8442c] dark:text-[#e08b6f]" role="alert">
          {error}
        </p>
      )}

      <section className="space-y-3">
        <h2 className="section-label">Being seen</h2>
        <div className="card p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <p className="text-[15px] font-medium">Let classmates see my name</p>
              <p className="text-[14px] leading-relaxed text-[var(--ink-soft)]">
                People in the same section can find you and add you. Your rooms and times stay
                between you and the people you've added back.
              </p>
            </div>
            <button
              role="switch"
              aria-checked={seen}
              aria-label="Let classmates see my name"
              disabled={pending}
              onClick={() => toggle(!seen)}
              className="relative mt-1 h-[26px] w-[46px] shrink-0 rounded-full border transition-colors"
              style={{
                background: seen ? "var(--clay)" : "var(--surface-sunken)",
                borderColor: seen ? "var(--clay)" : "var(--border-strong)",
              }}
            >
              <span
                className="absolute top-[2px] h-[20px] w-[20px] rounded-full bg-white transition-[left] duration-150"
                style={{ left: seen ? "23px" : "2px" }}
              />
            </button>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="section-label">Blocked</h2>
        {blocked.length === 0 ? (
          <p className="text-[15px] text-[var(--ink-soft)]">You haven't blocked anyone.</p>
        ) : (
          <div className="card px-4 py-1">
            <ul className="divide-y divide-[var(--border)]">
              {blocked.map((person) => (
                <li key={person.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <span className="block truncate text-[15px] font-medium">
                      {person.displayName ?? "Someone"}
                    </span>
                    <span className="mono block truncate text-[12px] text-[var(--ink-faint)]">
                      @{person.handle ?? "unknown"}
                    </span>
                  </div>
                  <button
                    className="btn btn-secondary px-3.5 py-2 text-[14px]"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        await friendAction("unblock", person.id);
                        router.refresh();
                      })
                    }
                  >
                    Unblock
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="section-label">Your schedule</h2>
        <div className="card space-y-3 p-5">
          <p className="text-[14px] leading-relaxed text-[var(--ink-soft)]">
            Deleting removes every class you've saved, along with everything built on it —
            your classmate counts and your shared free time. It can't be undone, but you can
            paste again.
          </p>
          {confirming === "schedule" ? (
            <div className="flex flex-wrap items-center gap-2">
              <button className="btn btn-danger" disabled={pending} onClick={deleteSchedule}>
                Yes, delete my schedule
              </button>
              <button className="btn btn-quiet" onClick={() => setConfirming(null)}>
                Keep it
              </button>
            </div>
          ) : (
            <button
              className="btn btn-danger"
              disabled={!hasSchedule || pending}
              onClick={() => setConfirming("schedule")}
            >
              {hasSchedule ? "Delete my schedule" : "No schedule saved"}
            </button>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="section-label">Account</h2>
        <div className="card space-y-3 p-5">
          <p className="text-[14px] leading-relaxed text-[var(--ink-soft)]">
            Deleting your account removes your schedule, your friends and your sign-in, for
            good.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {confirming === "account" ? (
              <>
                <button className="btn btn-danger" disabled={pending} onClick={deleteAccount}>
                  Yes, delete my account
                </button>
                <button className="btn btn-quiet" onClick={() => setConfirming(null)}>
                  Keep it
                </button>
              </>
            ) : (
              <>
                <button className="btn btn-secondary" disabled={pending} onClick={signOut}>
                  Sign out
                </button>
                <button
                  className="btn btn-danger"
                  disabled={pending}
                  onClick={() => setConfirming("account")}
                >
                  Delete my account
                </button>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
