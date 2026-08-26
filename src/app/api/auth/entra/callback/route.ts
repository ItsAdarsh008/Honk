import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  ENTRA_STATE_COOKIE,
  entraRedirectUri,
  exchangeAndVerify,
  type EntraFailure,
} from "@/lib/auth/entra";
import { createSession, findOrCreateEntraUser, hasProfile } from "@/lib/auth/session";
import { hasDatabase } from "@/lib/db";
import { siteUrl } from "@/lib/site";

export const runtime = "nodejs";

/**
 * Failures land back on the sign-in screen with a short reason rather than a
 * stack trace. `consent_required` is the one worth naming: it means Waterloo's
 * tenant does not let students approve third-party apps, and no amount of
 * retrying will change it — it needs IST.
 */
function back(reason: string) {
  return NextResponse.redirect(`${siteUrl()}/signin?entra=${reason}`);
}

const REASONS: Record<EntraFailure, string> = {
  not_configured: "unavailable",
  exchange_failed: "failed",
  bad_token: "failed",
  wrong_tenant: "not_waterloo",
  not_waterloo: "not_waterloo",
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const jar = await cookies();
  const raw = jar.get(ENTRA_STATE_COOKIE)?.value;
  jar.delete(ENTRA_STATE_COOKIE);

  // Entra reports a refused consent here rather than by failing the exchange.
  const oauthError = url.searchParams.get("error");
  if (oauthError) {
    return back(oauthError === "access_denied" ? "declined" : "consent_required");
  }

  if (!hasDatabase()) return back("unavailable");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state || !raw) return back("failed");

  let handoff: { state: string; nonce: string; verifier: string };
  try {
    handoff = JSON.parse(raw);
  } catch {
    return back("failed");
  }
  if (handoff.state !== state) return back("failed");

  const result = await exchangeAndVerify(code, handoff.verifier, entraRedirectUri(), handoff.nonce);
  if (!result.ok) return back(REASONS[result.reason]);

  const { user } = await findOrCreateEntraUser(result.identity);
  await createSession(user.id);

  // Back through the sign-in screen rather than straight to /home: the pasted
  // schedule is held in the browser, and only the client can save it. Landing
  // on /home directly would strand it.
  const next = hasProfile(user) ? "/signin?entra=ok" : "/signin?entra=ok&step=profile";
  return NextResponse.redirect(`${siteUrl()}${next}`);
}
