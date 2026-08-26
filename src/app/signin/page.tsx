import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignInFlow } from "@/components/SignInFlow";
import { getOptionalUser } from "@/lib/auth/current";
import { entraConfigured } from "@/lib/auth/entra";
import { hasDatabase } from "@/lib/db";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const entra = typeof params.entra === "string" ? params.entra : null;
  const step = typeof params.step === "string" ? params.step : null;

  const user = await getOptionalUser();
  // `entra=ok` still has work to do in the browser — the pasted schedule is
  // there, not on the server — so a fresh session is not a reason to bounce.
  if (user && entra !== "ok") redirect("/home");

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
      <SignInFlow entraEnabled={entraConfigured()} entraStatus={entra} initialStep={step} />
    </div>
  );
}
