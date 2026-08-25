import type { Metadata } from "next";
import { PasteFlow } from "@/components/PasteFlow";
import { getOptionalUser } from "@/lib/auth/current";

export const metadata: Metadata = { title: "Update your schedule" };
export const dynamic = "force-dynamic";

export default async function PastePage() {
  const user = await getOptionalUser();

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-[26px] font-semibold tracking-[-0.02em]">Update your schedule</h1>
        <p className="text-[15px] text-[var(--ink-soft)]">
          Paste the new one and it replaces what's saved for this term. Dropping a course or
          switching a tutorial is a re-paste.
        </p>
      </div>
      <div className="card p-5 sm:p-6">
        <PasteFlow signedIn={Boolean(user)} />
      </div>
    </div>
  );
}
