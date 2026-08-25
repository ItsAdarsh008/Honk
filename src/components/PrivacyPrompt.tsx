"use client";

/**
 * The discoverability prompt, shown once.
 *
 * Off by default, and it stays off if this is dismissed. The goal is an
 * informed yes, not a frightened no — so it explains what changes in plain
 * language, with no warning icons and nothing red, and says plainly that it
 * can be undone.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function PrivacyPrompt() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dismissed, setDismissed] = useState(false);

  const answer = (discoverable: boolean) => {
    setDismissed(true);
    startTransition(async () => {
      await fetch("/api/privacy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ discoverable }),
      }).catch(() => null);
      router.refresh();
    });
  };

  if (dismissed) return null;

  return (
    <section className="card rise space-y-4 p-5">
      <div className="space-y-2">
        <h2 className="text-[17px] font-semibold">
          Let people in your classes see your name?
        </h2>
        <p className="text-[15px] leading-relaxed text-[var(--ink-soft)]">
          With this on, anyone in the same section can see your name and add you. They still
          can't see your rooms or your times — those only ever show to people you've added
          back.
        </p>
        <p className="text-[14px] text-[var(--ink-faint)]">
          It's off right now. You can change it any time in settings.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" disabled={pending} onClick={() => answer(true)}>
          Yes, let them see me
        </button>
        <button className="btn btn-secondary" disabled={pending} onClick={() => answer(false)}>
          Keep me hidden
        </button>
      </div>
    </section>
  );
}
