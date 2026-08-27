import { describe, expect, it } from "vitest";
import {
  checkPassword,
  hashPassword,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  verifyPassword,
} from "./password";

describe("checkPassword", () => {
  it("asks for length and nothing else", () => {
    // No uppercase, no digit, no symbol. Composition rules produce Password1!
    // and a sticky note; length is what actually predicts strength.
    expect(checkPassword("correct horse battery staple")).toBeNull();
    expect(checkPassword("aaaaaaaa")).toBeNull();
    expect(checkPassword("ffffffff")).toBeNull();
  });

  it("refuses blank and short", () => {
    expect(checkPassword("")).toBe("blank");
    expect(checkPassword("   ")).toBe("blank");
    expect(checkPassword("a".repeat(MIN_PASSWORD_LENGTH - 1))).toBe("too_short");
  });

  it("caps the length so hashing stays cheap", () => {
    expect(checkPassword("a".repeat(MAX_PASSWORD_LENGTH))).toBeNull();
    expect(checkPassword("a".repeat(MAX_PASSWORD_LENGTH + 1))).toBe("too_long");
  });
});

describe("hashPassword and verifyPassword", () => {
  it("round-trips", async () => {
    const hash = await hashPassword("a good long passphrase");
    expect(await verifyPassword("a good long passphrase", hash)).toBe(true);
    expect(await verifyPassword("a good long passphrasE", hash)).toBe(false);
  });

  it("salts, so the same password hashes differently every time", async () => {
    const [a, b] = await Promise.all([hashPassword("same password"), hashPassword("same password")]);
    expect(a).not.toBe(b);
    expect(await verifyPassword("same password", a)).toBe(true);
    expect(await verifyPassword("same password", b)).toBe(true);
  });

  it("stores no trace of the password itself", async () => {
    const hash = await hashPassword("hunter2 and then some");
    expect(hash).not.toContain("hunter2");
    expect(hash.startsWith("scrypt$")).toBe(true);
  });

  it("treats equivalent unicode as the same password", async () => {
    // é typed as one codepoint or as e + combining accent. A password that
    // works on one keyboard and not another is the worst kind of bug.
    const composed = "café passphrase";
    const decomposed = "café passphrase";
    expect(composed).not.toBe(decomposed);
    expect(await verifyPassword(decomposed, await hashPassword(composed))).toBe(true);
  });

  it("refuses rather than throwing on a missing or corrupt hash", async () => {
    // A bad row should fail the sign-in, not take the route down.
    expect(await verifyPassword("anything", null)).toBe(false);
    expect(await verifyPassword("anything", "")).toBe(false);
    expect(await verifyPassword("anything", "not-a-hash")).toBe(false);
    expect(await verifyPassword("anything", "scrypt$x$y$z$bad$bad")).toBe(false);
    expect(await verifyPassword("anything", "bcrypt$1$2$3$4$5")).toBe(false);
  });
});
