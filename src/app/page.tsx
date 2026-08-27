import Link from "next/link";
import { redirect } from "next/navigation";
import { PasteFlow } from "@/components/PasteFlow";
import { getOptionalUser } from "@/lib/auth/current";
import { getCurrentTermCode } from "@/lib/overlap/queries";
import { getVisibleUserCount } from "@/lib/stats";
import { hasDatabase } from "@/lib/db";

/**
 * The first screen. It works with no account and no database: paste, and the
 * week appears. That is the whole pitch, so nothing stands in front of it.
 */
export default async function LandingPage() {
  const user = await getOptionalUser();

  // Someone who already has a schedule saved belongs on /home.
  if (user && hasDatabase()) {
    const term = await getCurrentTermCode(user.id).catch(() => null);
    if (term) redirect("/home");
  }

  const userCount = await getVisibleUserCount();

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <h1 className="text-[30px] font-semibold leading-[1.15] tracking-[-0.025em] sm:text-[38px]">
          Paste your schedule.
          <br />
          See who else is in it.
        </h1>
        <p className="max-w-lg text-[16px] leading-relaxed text-[var(--ink-soft)] sm:text-[17px]">
          Honk reads your Quest schedule, lays out your week, and shows you who you share
          classes with — and when you and your friends are free at the same time.
        </p>
        <div className="space-y-1 text-[14px] text-[var(--ink-faint)]">
          <p>Waterloo only. No account needed to see your week.</p>
          {userCount !== null && (
            <p>
              <span className="mono text-[var(--ink-soft)]">
                {userCount.toLocaleString("en-CA")}
              </span>{" "}
              {userCount === 1 ? "student has" : "students have"} joined so far.
            </p>
          )}
        </div>
      </section>

      <section className="card p-5 sm:p-6">
        <PasteFlow signedIn={Boolean(user)} />
      </section>

      <section className="space-y-3">
        <p className="section-label">What you get</p>
        <dl className="grid gap-4 sm:grid-cols-3">
          {/*
            Overlap first, timetable last. Laying out a week is what Quest and
            every scheduling tool already do — leading with it invites the
            comparison, and the comparison is the one Honk loses. The two things
            above it are the ones nothing else on campus does.
          */}
          {[
            {
              term: "Who's in your classes",
              detail: "How many people are in each section, and the names of those who opted in.",
            },
            {
              term: "When you're both free",
              detail: "Overlapping gaps with the friends you've added. Nobody else.",
            },
            {
              term: "Your week, laid out",
              detail: "Every class in place, with the gaps between them measured.",
            },
          ].map((item) => (

            <div key={item.term} className="space-y-1">
              <dt className="text-[15px] font-semibold">{item.term}</dt>
              <dd className="text-[14px] leading-relaxed text-[var(--ink-soft)]">
                {item.detail}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {user && (
        <p className="text-[15px] text-[var(--ink-soft)]">
          Signed in already —{" "}
          <Link href="/home" className="font-medium text-[var(--clay)] underline-offset-2 hover:underline">
            go to your classes
          </Link>
          .
        </p>
      )}
    </div>
  );
}
