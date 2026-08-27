import { describe, expect, it } from "vitest";
import { checkPin, hashPin, lockoutMinutes, PIN_LENGTH, verifyPin } from "./pin";

describe("checkPin", () => {
  it("accepts five digits that are not obvious", () => {
    for (const pin of ["48210", "90573", "20461"]) {
      expect(checkPin(pin)).toBeNull();
    }
  });

  it("insists on exactly five digits", () => {
    expect(checkPin("1234")).toBe("wrong_length");
    expect(checkPin("123456")).toBe("wrong_length");
    expect(checkPin("")).toBe("wrong_length");
    expect(checkPin("1234a")).toBe("not_digits");
    expect(PIN_LENGTH).toBe(5);
  });

  it("refuses the PINs an attacker tries first", () => {
    // Per-account lockouts do nothing against spraying one guess across many
    // accounts. Spraying only works because a few PINs are over-chosen, so
    // refusing those is the defence that actually applies.
    for (const pin of ["11111", "00000", "12345", "54321", "13579", "24680", "98765"]) {
      expect(checkPin(pin)).toBe("too_guessable");
    }
  });

  it("does not refuse a PIN merely for containing a run", () => {
    // 12345 is out; 12348 is fine. The rule is the whole shape, not a substring.
    expect(checkPin("12348")).toBeNull();
    expect(checkPin("11112")).toBeNull();
  });
});

describe("hashPin and verifyPin", () => {
  it("round-trips", async () => {
    const hash = await hashPin("48210");
    expect(await verifyPin("48210", hash)).toBe(true);
    expect(await verifyPin("48211", hash)).toBe(false);
  });

  it("salts, so the same PIN hashes differently every time", async () => {
    const [a, b] = await Promise.all([hashPin("48210"), hashPin("48210")]);
    expect(a).not.toBe(b);
    expect(await verifyPin("48210", a)).toBe(true);
    expect(await verifyPin("48210", b)).toBe(true);
  });

  it("stores no trace of the PIN itself", async () => {
    const hash = await hashPin("48210");
    expect(hash).not.toContain("48210");
    expect(hash.startsWith("scrypt$")).toBe(true);
  });

  it("refuses rather than throwing on a missing or corrupt hash", async () => {
    expect(await verifyPin("48210", null)).toBe(false);
    expect(await verifyPin("48210", "")).toBe(false);
    expect(await verifyPin("48210", "not-a-hash")).toBe(false);
    expect(await verifyPin("48210", "scrypt$x$y$z$bad$bad")).toBe(false);
    expect(await verifyPin("48210", "bcrypt$1$2$3$4$5")).toBe(false);
  });
});

describe("lockoutMinutes", () => {
  it("costs a typo nothing", () => {
    for (const n of [0, 1, 2, 3, 4]) expect(lockoutMinutes(n)).toBeNull();
  });

  it("lengthens with the run, so patience gets expensive", () => {
    // Flat fifteen minutes would still allow ~1,000 guesses a day against a
    // 100,000-wide space. Escalating is what makes that impractical.
    expect(lockoutMinutes(5)).toBe(15);
    expect(lockoutMinutes(10)).toBe(60);
    expect(lockoutMinutes(15)).toBe(6 * 60);
    expect(lockoutMinutes(20)).toBe(24 * 60);
    expect(lockoutMinutes(100)).toBe(24 * 60);
  });

  it("never decreases", () => {
    let previous = 0;
    for (let n = 0; n <= 30; n += 1) {
      const current = lockoutMinutes(n) ?? 0;
      expect(current).toBeGreaterThanOrEqual(previous);
      previous = current;
    }
  });
});
