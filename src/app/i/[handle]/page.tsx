import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PasteFlow } from "@/components/PasteFlow";
import { getOptionalUser } from "@/lib/auth/current";
import { getInviterName } from "@/lib/invite";

/**
 * An invite link.
 *
 * A signed-out visitor lands on the paste screen, not a signup wall — the
 * payoff has to be visible before registration, or the loop breaks at exactly
 * the point where it needs to spread.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const { handle } = await params;
  const name = await getInviterName(handle);
  const title = name ? `${name} invited you to Honk` : "You've been invited to Honk";
  return {
    title,
    description: "Paste your class schedule and see which classes you share.",
    openGraph: {
      title,
      description: "Paste your class schedule and see which classes you share.",
    },
    /*
     * Twitter falls back to the Open Graph tags for everything it is not given
     * outright, and the root layout gives it a title — which meant an invite
     * pasted anywhere reading the twitter card announced the product rather
     * than the person. Both cards now say the same thing.
     *
     * Neither block names an image: `opengraph-image.tsx` in this folder is
     * the image for this route, and Next fills both sets of tags in from it.
     */
    twitter: {
      card: "summary_large_image",
      title,
      description: "Paste your class schedule and see which classes you share.",
    },
  };
}

export default async function InvitePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const user = await getOptionalUser();
  if (user) redirect(`/u/${handle}`);

  const name = await getInviterName(handle);

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h1 className="text-[30px] font-semibold leading-[1.15] tracking-[-0.025em] sm:text-[36px]">
          {name ? `${name} is on Honk.` : "Someone sent you Honk."}
          <br />
          Paste your schedule to see what you share.
        </h1>
        <p className="max-w-lg text-[16px] leading-relaxed text-[var(--ink-soft)]">
          Honk reads your class schedule and lays out your week. You'll see it before you sign
          up for anything.
        </p>
      </section>

      <section className="card p-5 sm:p-6">
        <PasteFlow signedIn={false} />
      </section>
    </div>
  );
}
