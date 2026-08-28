import type { Metadata } from "next";
import Link from "next/link";
import { UniversityList } from "@/components/UniversityList";
import { LIVE_SCHOOLS, WAITLIST_SCHOOLS, liveSchoolCount } from "@/lib/schools";

export const metadata: Metadata = {
  title: "Universities",
  description:
    "Honk is live at ten Canadian universities and looking for beta testers everywhere else. Bring it to yours.",
};

const CONTACT = "adarshthoduvakkal@gmail.com";

/**
 * The wall, and the door in it.
 *
 * Two audiences land here. Somebody at a live school wants to know Honk is
 * real, and the top of the page is for them. Somebody at any of the other
 * ninety universities in the country has just been told no, and the rest of
 * the page is for them — because that person is the most valuable visitor the
 * site gets and "not supported" is a terrible last thing to say to them.
 *
 * The offer is deliberately concrete and deliberately small. Not "join the
 * waitlist", which costs them nothing and gets them nothing. One email with
 * one paste in it, and their school works — because that genuinely is the
 * blocker, and saying so is more persuasive than any amount of enthusiasm.
 */
export default function UniversitiesPage() {
  const proven = LIVE_SCHOOLS.filter((s) => !s.beta).map((s) => s.short);
  const betaCount = LIVE_SCHOOLS.length - proven.length;
  const provenList =
    proven.length === 0
      ? null
      : proven.length === 1
        ? proven[0]
        : `${proven.slice(0, -1).join(", ")} and ${proven[proven.length - 1]}`;

  return (
    <div className="space-y-12">
      <section className="space-y-4">
        {/* Counted, not typed. It was "five" for about a day. */}
        <h1 className="text-[30px] font-semibold leading-[1.15] tracking-[-0.025em] sm:text-[36px]">
          {liveSchoolCount()} universities.
          <br />
          Yours could be next.
        </h1>
        <p className="max-w-lg text-[16px] leading-relaxed text-[var(--ink-soft)]">
          Honk reads your class schedule and shows you who else is in it, and when you and
          your friends are free at the same time. Friends work across universities — if half
          your group went to Mac and half stayed here, you can still see when everyone is
          free on a Thursday.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="section-label">Live now</h2>
        <ul className="card divide-y divide-[var(--border)] px-4 py-1">
          {LIVE_SCHOOLS.map((school) => (
            <li key={school.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="truncate text-[15px] font-medium">{school.name}</span>
                  {school.beta && <span className="chip shrink-0">beta</span>}
                </span>
                <span className="mono block truncate text-[12px] text-[var(--ink-faint)]">
                  @{school.canonicalDomain}
                </span>
              </div>
              <span className="mono shrink-0 text-[12px] text-[var(--ink-faint)]">
                {school.guide?.portal ?? "live"}
              </span>
            </li>
          ))}
        </ul>

        {/*
          Said plainly and once, right under the list, rather than buried in a
          footnote. Beta here has a specific meaning and a student deserves the
          real one: it is not "unpolished", it is "nobody has proved Honk can
          read your portal yet".

          Read from the same list the tags are, so flipping a school in
          `schools-out-of-beta.ts` cannot leave this paragraph claiming
          something that stopped being true.
        */}
        {betaCount > 0 && (
          <p className="text-[14px] leading-relaxed text-[var(--ink-soft)]">
            {provenList ? (
              <>
                Everywhere except {provenList} is in{" "}
                <strong className="font-semibold">beta</strong>.
              </>
            ) : (
              <>
                Every school here is in <strong className="font-semibold">beta</strong>.
              </>
            )}{" "}
            A portal comes out of beta when a real student&rsquo;s paste has been read
            correctly and kept as a test — until then it was built from documentation and
            nothing more. Your week is shown to you before anything saves, so you will see
            it if it comes out wrong, and{" "}
            <a
              href={`mailto:${CONTACT}?subject=${encodeURIComponent("Honk read my schedule wrong")}`}
              className="font-medium text-[var(--clay)] underline-offset-2 hover:underline"
            >
              sending me the paste
            </a>{" "}
            is what moves a school off this list.
          </p>
        )}

        <p className="text-[14px] text-[var(--ink-soft)]">
          Got one of those addresses?{" "}
          <Link
            href="/signin"
            className="font-medium text-[var(--clay)] underline-offset-2 hover:underline"
          >
            Sign in
          </Link>
          .
        </p>
      </section>

      <section className="space-y-4">
        <div className="space-y-2">
          <h2 className="text-[22px] font-semibold tracking-[-0.015em]">
            Seeking beta testers
          </h2>
          <p className="max-w-lg text-[15px] leading-relaxed text-[var(--ink-soft)]">
            Honk is built by one person — a first-year student, not a company. Every school
            it reads, it reads because somebody there sent me their timetable and I taught
            the parser what their portal prints. That is the entire process, and it takes
            about a week.
          </p>
        </div>

        <div className="card space-y-4 p-5 sm:p-6">
          <div className="space-y-2">
            <h3 className="text-[16px] font-semibold">What I need from you</h3>
            <ul className="space-y-2 text-[15px] leading-relaxed text-[var(--ink-soft)]">
              {[
                "Your timetable, copied out of your school's portal and pasted into an email. Delete anything you would rather not send — the course codes, days, times and rooms are the parts that matter, and your name is not one of them.",
                "What the portal is called. Quest, Mosaic, WebAdvisor, REM, Self Serve — every school brands it differently.",
                "What student email addresses end in at your school.",
              ].map((item, i) => (
                <li key={item} className="flex gap-3">
                  <span className="mono mt-1 shrink-0 text-[11px] text-[var(--ink-faint)]">
                    {i + 1}
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <hr className="hairline" />

          <div className="space-y-2">
            <h3 className="text-[16px] font-semibold">What you get</h3>
            <dl className="space-y-3">
              {[
                {
                  term: "Your school, live, in about a week",
                  detail:
                    "One real paste is the whole blocker. I can write a parser for any portal; I cannot log in to yours to see what it prints.",
                },
                {
                  term: "First pick of handles",
                  detail:
                    "Get in before your campus does and @you is still available. It is a small thing and it is the thing people care about.",
                },
                {
                  term: "A direct line to whoever is building it",
                  detail:
                    "That is me, and I read every email. Beta schools' requests get built first, because they are the ones telling me what is broken.",
                },
                {
                  term: "Credit on this page, if you want it",
                  detail:
                    "The person who brings a school gets named as the one who brought it. Entirely optional — say so in the email either way.",
                },
                {
                  term: "The thing you actually came for",
                  detail:
                    "Honk is worth nothing with one user. Bringing your school means bringing the people you would want to see it with, which is the only way this is useful to you at all.",
                },
              ].map((item) => (
                <div key={item.term} className="space-y-0.5">
                  <dt className="text-[15px] font-medium">{item.term}</dt>
                  <dd className="text-[14px] leading-relaxed text-[var(--ink-soft)]">
                    {item.detail}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <hr className="hairline" />

          <div className="space-y-2">
            <p className="text-[15px]">
              Email{" "}
              <a
                href={`mailto:${CONTACT}?subject=${encodeURIComponent("Honk at my university")}`}
                className="font-medium text-[var(--clay)] underline-offset-2 hover:underline"
              >
                {CONTACT}
              </a>
              , or find your school below and the draft writes itself.
            </p>
            <p className="text-[13px] leading-relaxed text-[var(--ink-faint)]">
              What happens to what you send: the paste is used to teach the parser your
              portal&rsquo;s layout and to write a test out of it, and it is not put in the
              database or shown to anyone. Same rule as the app itself — your schedule is
              only ever visible to people you have added.
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-[22px] font-semibold tracking-[-0.015em]">
            Waiting on a first paste
          </h2>
          <p className="text-[15px] text-[var(--ink-soft)]">
            {WAITLIST_SCHOOLS.length} universities Honk knows the name of and cannot read
            yet. Yours is one email from moving up.
          </p>
        </div>
        <UniversityList />
      </section>
    </div>
  );
}
