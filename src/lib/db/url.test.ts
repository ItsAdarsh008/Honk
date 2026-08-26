import { describe, expect, it } from "vitest";
import { normalizeDatabaseUrl } from "./url";

const URL = "postgresql://u:p@host.neon.tech/neondb?sslmode=require";

describe("normalizeDatabaseUrl", () => {
  it("passes a plain connection string through", () => {
    expect(normalizeDatabaseUrl(URL)).toBe(URL);
  });

  it("strips the double quotes a .env line carries", () => {
    // The deploy bug: pasted from .env.local into a hosting dashboard, which
    // does not strip quotes the way dotenv does.
    expect(normalizeDatabaseUrl(`"${URL}"`)).toBe(URL);
  });

  it("strips single quotes too", () => {
    expect(normalizeDatabaseUrl(`'${URL}'`)).toBe(URL);
  });

  it("trims surrounding whitespace, inside quotes as well as out", () => {
    expect(normalizeDatabaseUrl(`  ${URL}  `)).toBe(URL);
    expect(normalizeDatabaseUrl(`" ${URL} "`)).toBe(URL);
  });

  it("leaves an unmatched quote alone", () => {
    // A password may legitimately contain one; only a matched pair is padding.
    expect(normalizeDatabaseUrl(`"${URL}`)).toBe(`"${URL}`);
    expect(normalizeDatabaseUrl(`${URL}"`)).toBe(`${URL}"`);
  });

  it("treats missing, empty and quote-only values as unconfigured", () => {
    expect(normalizeDatabaseUrl(undefined)).toBeNull();
    expect(normalizeDatabaseUrl(null)).toBeNull();
    expect(normalizeDatabaseUrl("")).toBeNull();
    expect(normalizeDatabaseUrl("   ")).toBeNull();
    expect(normalizeDatabaseUrl('""')).toBeNull();
  });
});
