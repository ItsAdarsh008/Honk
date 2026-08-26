import { afterEach, describe, expect, it } from "vitest";
import { CAP_WINDOW_MS, DEFAULT_EMAIL_DAILY_CAP, emailDailyCap, slotFreesInMinutes } from "./capacity";

const original = process.env.EMAIL_DAILY_CAP;
afterEach(() => {
  if (original === undefined) delete process.env.EMAIL_DAILY_CAP;
  else process.env.EMAIL_DAILY_CAP = original;
});

describe("emailDailyCap", () => {
  it("defaults to the Resend free tier", () => {
    delete process.env.EMAIL_DAILY_CAP;
    expect(emailDailyCap()).toBe(DEFAULT_EMAIL_DAILY_CAP);
  });

  it("takes the configured value", () => {
    process.env.EMAIL_DAILY_CAP = "5000";
    expect(emailDailyCap()).toBe(5000);
  });

  it("falls back rather than throwing on a value written wrong", () => {
    // A cap of 0 or "lots" must not switch sign-in off for everyone.
    for (const bad of ["", "  ", "lots", "0", "-20", "NaN"]) {
      process.env.EMAIL_DAILY_CAP = bad;
      expect(emailDailyCap()).toBe(DEFAULT_EMAIL_DAILY_CAP);
    }
  });

  it("floors a fractional value", () => {
    process.env.EMAIL_DAILY_CAP = "99.7";
    expect(emailDailyCap()).toBe(99);
  });
});

describe("slotFreesInMinutes", () => {
  const now = new Date("2026-09-08T12:00:00Z");

  it("counts from 24 hours after the oldest send", () => {
    const oldest = new Date(now.getTime() - 20 * 60 * 60_000);
    expect(slotFreesInMinutes(oldest, now)).toBe(4 * 60);
  });

  it("never returns zero or a negative wait", () => {
    // An already-expired slot is a race, not a reason to say "0 minutes".
    expect(slotFreesInMinutes(new Date(now.getTime() - CAP_WINDOW_MS), now)).toBe(1);
    expect(slotFreesInMinutes(new Date(now.getTime() - 2 * CAP_WINDOW_MS), now)).toBe(1);
  });

  it("is a full day when the oldest send is just now", () => {
    expect(slotFreesInMinutes(now, now)).toBe(24 * 60);
  });
});
