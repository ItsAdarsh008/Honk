import { afterEach, describe, expect, it } from "vitest";
import { rpId, rpOrigin } from "./passkey";

const original = process.env.NEXT_PUBLIC_SITE_URL;
afterEach(() => {
  if (original === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = original;
});

describe("relying party identity", () => {
  it("is the hostname of the configured site", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://honk.adarshthoduvakkal.com";
    expect(rpOrigin()).toBe("https://honk.adarshthoduvakkal.com");
    expect(rpId()).toBe("honk.adarshthoduvakkal.com");
  });

  it("follows a site URL written without a scheme", () => {
    // siteUrl() normalises these; a passkey bound to the wrong origin simply
    // stops working, so this must not silently fall through to localhost.
    process.env.NEXT_PUBLIC_SITE_URL = "honk.adarshthoduvakkal.com/";
    expect(rpId()).toBe("honk.adarshthoduvakkal.com");
  });

  it("never includes the scheme or a port in the id", () => {
    // rpID is a bare domain; anything else fails the ceremony in the browser.
    process.env.NEXT_PUBLIC_SITE_URL = "https://honk.adarshthoduvakkal.com";
    expect(rpId()).not.toContain("://");
    expect(rpId()).not.toContain(":");
  });
});
