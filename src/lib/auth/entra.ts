import "server-only";

/**
 * Signing in with a Waterloo account.
 *
 * Email codes proved to be the wrong hinge for a Waterloo-only app: the whole
 * product gated on a channel nobody here controls, and the failure was silent —
 * Resend reports `delivered` whether or not a filter eats the message. This
 * path removes email from sign-in entirely.
 *
 * It also proves more. A code proves someone can read a mailbox. A token from
 * Waterloo's own directory proves an active Waterloo account, which is the
 * guarantee SPEC section 6 actually leans on.
 *
 * Waterloo's tenant endpoint is used rather than `/common`, so an account from
 * anywhere else cannot even begin the flow. `tid` is checked again on the way
 * back regardless: the endpoint is a convenience, the claim is the control.
 */

import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { siteUrl } from "../site";
import { normalizeEmail } from "./session";

/** Public, and discoverable from `login.microsoftonline.com/uwaterloo.ca`. */
export const UW_TENANT_ID = "723a5a87-f39a-4a22-9247-3fc240c01396";

const AUTHORITY = `https://login.microsoftonline.com/${UW_TENANT_ID}`;
export const ENTRA_ISSUER = `${AUTHORITY}/v2.0`;
const AUTHORIZE_ENDPOINT = `${AUTHORITY}/oauth2/v2.0/authorize`;
const TOKEN_ENDPOINT = `${AUTHORITY}/oauth2/v2.0/token`;

/**
 * The narrowest set that yields an identity. Every extra permission raises the
 * bar for consent, and a tenant that restricts third-party apps is the most
 * likely thing to stop this working at all.
 */
const SCOPES = "openid profile email";

const jwks = createRemoteJWKSet(new URL(`${AUTHORITY}/discovery/v2.0/keys`));

export function entraClientId(): string | null {
  return process.env.ENTRA_CLIENT_ID?.trim() || null;
}

function entraClientSecret(): string | null {
  return process.env.ENTRA_CLIENT_SECRET?.trim() || null;
}

/** Both halves or nothing: a half-configured app would fail at the redirect. */
export function entraConfigured(): boolean {
  return entraClientId() !== null && entraClientSecret() !== null;
}

/* ------------------------------------------------------------------ *
 * PKCE and one-time values
 * ------------------------------------------------------------------ */

export function randomUrlSafe(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function codeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export interface AuthorizeParams {
  redirectUri: string;
  state: string;
  nonce: string;
  verifier: string;
}

export function authorizeUrl({ redirectUri, state, nonce, verifier }: AuthorizeParams): string {
  const url = new URL(AUTHORIZE_ENDPOINT);
  url.searchParams.set("client_id", entraClientId() ?? "");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("code_challenge", codeChallenge(verifier));
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

/* ------------------------------------------------------------------ *
 * Token exchange and verification
 * ------------------------------------------------------------------ */

export type EntraFailure =
  | "not_configured"
  | "exchange_failed"
  | "bad_token"
  | "wrong_tenant"
  | "not_waterloo";

export interface EntraIdentity {
  /** Immutable per user per tenant. The durable key; email can change. */
  oid: string;
  email: string;
  name: string | null;
}

export type EntraResult =
  | { ok: true; identity: EntraIdentity }
  | { ok: false; reason: EntraFailure; detail?: string };

export async function exchangeAndVerify(
  code: string,
  verifier: string,
  redirectUri: string,
  nonce: string,
): Promise<EntraResult> {
  const clientId = entraClientId();
  const clientSecret = entraClientSecret();
  if (!clientId || !clientSecret) return { ok: false, reason: "not_configured" };

  let idToken: string;
  try {
    const response = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        code_verifier: verifier,
        scope: SCOPES,
      }),
    });
    const body = (await response.json()) as { id_token?: string; error_description?: string };
    if (!response.ok || !body.id_token) {
      return { ok: false, reason: "exchange_failed", detail: body.error_description };
    }
    idToken = body.id_token;
  } catch (err) {
    return {
      ok: false,
      reason: "exchange_failed",
      detail: err instanceof Error ? err.message : "network error",
    };
  }

  try {
    const { payload } = await jwtVerify(idToken, jwks, {
      issuer: ENTRA_ISSUER,
      audience: clientId,
    });

    if (payload.nonce !== nonce) return { ok: false, reason: "bad_token", detail: "nonce" };
    // The tenant endpoint should make this impossible; check it anyway.
    if (payload.tid !== UW_TENANT_ID) return { ok: false, reason: "wrong_tenant" };

    const oid = typeof payload.oid === "string" ? payload.oid : null;
    if (!oid) return { ok: false, reason: "bad_token", detail: "oid" };

    return identityFrom(payload, oid);
  } catch (err) {
    return {
      ok: false,
      reason: "bad_token",
      detail: err instanceof Error ? err.message : "verify failed",
    };
  }
}

/**
 * Waterloo's tenant can hold guest accounts whose address is not a Waterloo
 * one, so passing the tenant check is not the same as being a student. The
 * address is gated with the same rule the email path uses.
 */
function identityFrom(payload: Record<string, unknown>, oid: string): EntraResult {
  const candidates = [payload.email, payload.preferred_username, payload.upn];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const email = normalizeEmail(candidate);
    if (email) {
      const name = typeof payload.name === "string" ? payload.name.trim() || null : null;
      return { ok: true, identity: { oid, email, name } };
    }
  }
  return { ok: false, reason: "not_waterloo" };
}

/** Both routes need these, and a route file may only export handlers. */
export const ENTRA_STATE_COOKIE = "honk_entra";

/** Must match the redirect URI registered on the app, exactly. */
export function entraRedirectUri(): string {
  return `${siteUrl()}/api/auth/entra/callback`;
}
