import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SettingsPanel } from "@/components/SettingsPanel";
import { getOptionalUser } from "@/lib/auth/current";
import { listBlocked } from "@/lib/friends";
import { getCurrentTermCode } from "@/lib/overlap/queries";
import { schoolOrDefault } from "@/lib/schools";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getOptionalUser();
  if (!user) redirect("/signin");

  const [blocked, termCode] = await Promise.all([
    listBlocked(user.id),
    getCurrentTermCode(user.id),
  ]);

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-[26px] font-semibold tracking-[-0.02em]">Settings</h1>
        <p className="mono text-[13px] text-[var(--ink-faint)]">
          {user.handle ? `@${user.handle}` : user.email} · {schoolOrDefault(user.schoolId).name}
        </p>
      </div>

      <SettingsPanel
        discoverable={user.discoverable}
        blocked={blocked}
        hasSchedule={termCode !== null}
      />
    </div>
  );
}
