"use client";

/**
 * The list of universities Honk is not at yet.
 *
 * Fifty-odd rows is too many to read and exactly right to search, so the box
 * at the top is the whole interface. Every row is a mailto with the school's
 * name already in the subject and the three things I actually need already in
 * the body — because "email me" converts far worse than "here is the email,
 * press send".
 *
 * The pre-filled body is doing real work. The bottleneck on adding a school is
 * never enthusiasm, it is getting one real paste out of a portal I cannot log
 * in to. Asking for it in the draft, with the "delete anything you would
 * rather not send" line right there, is the difference between a reply that
 * unblocks the work and a reply that says "yes please".
 */

import { useMemo, useState } from "react";
import { WAITLIST_SCHOOLS, waitlistByProvince, type School } from "@/lib/schools";

const CONTACT = "adarshthoduvakkal@gmail.com";

function mailtoFor(school: School | null): string {
  const name = school?.name ?? "my university";
  const subject = school ? `Honk at ${school.short}` : "Honk at my university";
  const body = [
    `I go to ${name} and I want Honk here.`,
    "",
    "Here is what you need:",
    "",
    "1. My schedule, pasted below — copied out of the portal, with anything I",
    "   would rather not send deleted. Room numbers and course codes are the",
    "   parts that matter; my name is not needed.",
    "",
    "2. The portal is called: ",
    "3. Student email addresses here end in: @",
    "",
    "--- paste below this line ---",
    "",
  ].join("\n");
  return `mailto:${CONTACT}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function UniversityList() {
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return waitlistByProvince();
    const matches = (school: School) =>
      school.name.toLowerCase().includes(needle) ||
      school.short.toLowerCase().includes(needle) ||
      school.domains.some((d) => d.includes(needle));
    return waitlistByProvince()
      .map((group) => ({ ...group, schools: group.schools.filter(matches) }))
      .filter((group) => group.schools.length > 0);
  }, [query]);

  const found = groups.reduce((n, g) => n + g.schools.length, 0);

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <label htmlFor="school-search" className="section-label">
          Find your university
        </label>
        <input
          id="school-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Queen's, UBC, Dalhousie…"
          className="field"
          autoComplete="off"
        />
        <p className="mono text-[12px] text-[var(--ink-faint)]">
          {found} of {WAITLIST_SCHOOLS.length} waiting
        </p>
      </div>

      {found === 0 ? (
        <div className="card space-y-3 p-5">
          <p className="text-[15px] text-[var(--ink-soft)]">
            Not on the list. That is not a no — the list is just the schools I got round to
            typing out. Email me and yours goes on it.
          </p>
          <a href={mailtoFor(null)} className="btn btn-primary">
            Email about my university
          </a>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.province} className="space-y-2">
              <h3 className="mono text-[11px] uppercase tracking-[0.08em] text-[var(--ink-faint)]">
                {group.province}
              </h3>
              <ul className="card divide-y divide-[var(--border)] px-4 py-1">
                {group.schools.map((school) => (
                  <li
                    key={school.id}
                    className="flex items-center justify-between gap-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <span className="block truncate text-[15px] font-medium">
                        {school.name}
                      </span>
                      <span className="mono block truncate text-[12px] text-[var(--ink-faint)]">
                        @{school.domains[0]}
                      </span>
                    </div>
                    <a
                      href={mailtoFor(school)}
                      className="btn btn-secondary shrink-0 px-3.5 py-2 text-[14px]"
                    >
                      Bring Honk here
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The same call to action, for the sign-in screen — where somebody has just
 * typed an address at a school that is not live and is one click from leaving.
 */
export function BringHonkHere({ school }: { school: School }) {
  return (
    <div className="space-y-3 rounded-[10px] border border-[var(--border)] bg-[var(--surface-sunken)] p-4">
      <p className="text-[15px] font-semibold">Honk isn&rsquo;t at {school.short} yet.</p>
      <p className="text-[14px] leading-relaxed text-[var(--ink-soft)]">
        It could be in about a week, and it takes one email from you: your timetable pasted
        out of the portal, the portal&rsquo;s name, and what student addresses end in. That
        is genuinely the whole blocker — I can write the parser, I just cannot log in to
        your school to see what it prints.
      </p>
      <div className="flex flex-wrap gap-2">
        <a href={mailtoFor(school)} className="btn btn-primary">
          Turn on {school.short}
        </a>
        <a href="/universities" className="btn btn-quiet">
          What that gets you
        </a>
      </div>
    </div>
  );
}
