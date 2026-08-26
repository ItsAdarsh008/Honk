import { describe, expect, it } from "vitest";
import { authorizeUrl, codeChallenge, randomUrlSafe, UW_TENANT_ID, ENTRA_ISSUER } from "./entra";

describe("Waterloo tenant", () => {
  it("points at the tenant, never /common", () => {
    // /common would let any Microsoft account reach the consent screen. The
    // tenant id is public and discoverable from login.microsoftonline.com.
    expect(UW_TENANT_ID).toBe("723a5a87-f39a-4a22-9247-3fc240c01396");
    expect(ENTRA_ISSUER).toBe(`https://login.microsoftonline.com/${UW_TENANT_ID}/v2.0`);
  });
});

describe("authorizeUrl", () => {
  const params = {
    redirectUri: "https://honk-loo.vercel.app/api/auth/entra/callback",
    state: "st",
    nonce: "no",
    verifier: "ve",
  };

  it("targets Waterloo's tenant endpoint", () => {
    const url = new URL(authorizeUrl(params));
    expect(url.origin + url.pathname).toBe(
      `https://login.microsoftonline.com/${UW_TENANT_ID}/oauth2/v2.0/authorize`,
    );
  });

  it("asks for the narrowest scopes that yield an identity", () => {
    // Every extra permission raises the consent bar, and a tenant that
    // restricts third-party apps is the likeliest thing to block this.
    const url = new URL(authorizeUrl(params));
    expect(url.searchParams.get("scope")).toBe("openid profile email");
  });

  it("carries PKCE, state and nonce", () => {
    const url = new URL(authorizeUrl(params));
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("st");
    expect(url.searchParams.get("nonce")).toBe("no");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe(codeChallenge("ve"));
  });

  it("never puts the verifier itself in the URL", () => {
    // The whole point of PKCE: the redirect carries the hash, not the secret.
    expect(authorizeUrl(params)).not.toContain("ve&");
    expect(new URL(authorizeUrl(params)).searchParams.get("code_verifier")).toBeNull();
  });
});

describe("codeChallenge", () => {
  it("is the base64url SHA-256 of the verifier, per RFC 7636", () => {
    // The worked example from the RFC.
    expect(codeChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });
});

describe("randomUrlSafe", () => {
  it("is URL-safe and does not repeat", () => {
    const a = randomUrlSafe();
    const b = randomUrlSafe();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
