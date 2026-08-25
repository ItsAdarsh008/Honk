import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignInFlow } from "@/components/SignInFlow";
import { getOptionalUser } from "@/lib/auth/current";
import { hasDatabase } from "@/lib/db";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage() {
  const user = await getOptionalUser();
  if (user) redirect("/home");

  if (!hasDatabase()) {
    return (
      <div className="card p-6">
        <h1 className="text-[20px] font-semibold">Accounts aren't switched on yet</h1>
        <p className="mt-2 text-[15px] text-[var(--ink-soft)]">
          Honk isn't connected to a database, so there's nowhere to save a schedule. Pasting
          still works — your week renders in the browser.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md">
      <SignInFlow />
    </div>
  );
}
