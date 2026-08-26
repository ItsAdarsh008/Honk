import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  authorizeUrl,
  ENTRA_STATE_COOKIE,
  entraConfigured,
  entraRedirectUri,
  randomUrlSafe,
} from "@/lib/auth/entra";
import { siteUrl } from "@/lib/site";

export const runtime = "nodejs";

/** Long enough to sign in, short enough that a stale tab cannot be replayed. */
const HANDOFF_TTL_SECONDS = 15 * 60;

/**
 * Hand off to Waterloo.
 *
 * `state`, `nonce` and the PKCE verifier are minted here and parked in one
 * httpOnly cookie. All three are checked on the way back: state against CSRF,
 * nonce against a replayed id_token, verifier against an intercepted code.
 */
export async function GET() {
  if (!entraConfigured()) {
    return NextResponse.redirect(`${siteUrl()}/signin?entra=unavailable`);
  }

  const state = randomUrlSafe(16);
  const nonce = randomUrlSafe(16);
  const verifier = randomUrlSafe(32);

  const jar = await cookies();
  jar.set(ENTRA_STATE_COOKIE, JSON.stringify({ state, nonce, verifier }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: HANDOFF_TTL_SECONDS,
  });

  return NextResponse.redirect(
    authorizeUrl({ redirectUri: entraRedirectUri(), state, nonce, verifier }),
  );
}
