"use client";

/**
 * Five pills and a way out.
 *
 * This is the whole "which university" interface. Not a dropdown of ninety
 * Canadian institutions — a dropdown says "find yourself in this list" and
 * puts the four schools that actually work behind a scroll. Five pills say
 * "these are live", and the sixth thing on the row says what to do if yours
 * is not, which is the only other case there is.
 *
 * It disappears entirely once there is an account: at that point the school is
 * whichever one the address belongs to, and asking again would only be a way
 * to get it wrong.
 */

import Link from "next/link";
import { LIVE_SCHOOLS } from "@/lib/schools";

export function SchoolPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="section-label">Where do you go?</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {LIVE_SCHOOLS.map((school) => {
          const selected = school.id === value;
          return (
            <button
              key={school.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(school.id)}
              className={
                selected
                  ? "mono rounded-[6px] border border-[var(--clay)] bg-[var(--clay)] px-2.5 py-1.5 text-[12px] text-[var(--surface)]"
                  : "mono rounded-[6px] border border-[var(--border)] px-2.5 py-1.5 text-[12px] text-[var(--ink-soft)] hover:border-[var(--ink-faint)]"
              }
            >
              {school.short}
            </button>
          );
        })}
        <Link
          href="/universities"
          className="mono rounded-[6px] px-2.5 py-1.5 text-[12px] text-[var(--ink-faint)] underline-offset-2 hover:text-[var(--clay)] hover:underline"
        >
          somewhere else
        </Link>
      </div>
    </div>
  );
}
