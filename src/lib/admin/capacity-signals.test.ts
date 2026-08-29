/**
 * The bands that decide when the dashboard says "act now".
 *
 * Worth testing because they are the whole point of the page: a threshold that
 * is quietly wrong produces a dashboard that is calm right up until the site
 * stops working, which is worse than no dashboard.
 */

import { describe, expect, it } from "vitest";
import { capacitySignals, estimateBytes, formatBytes, type SignalInput } from "./capacity-signals";

const base: SignalInput = {
  totalUsers: 0,
  withSchedule: 0,
  recentSignups: 0,
  sectionRows: 0,
  meetingRows: 0,
  enrollmentRows: 0,
};

const signal = (input: Partial<SignalInput>, id: string) =>
  capacitySignals({ ...base, ...input }).find((s) => s.id === id)!;

describe("Neon compute band", () => {
  it("is calm while the database can still sleep", () => {
    expect(signal({ totalUsers: 13 }, "neon-compute").level).toBe("good");
  });

  it("warns once usage is spread over a teaching day", () => {
    // PAID.md: ~190 compute-hours is about 6.3 hours awake a day, which a few
    // dozen students checking between classes is enough to exceed.
    expect(signal({ totalUsers: 50 }, "neon-compute").level).toBe("watch");
    expect(signal({ totalUsers: 299 }, "neon-compute").level).toBe("watch");
  });

  it("says act once the endpoint is certainly awake all day", () => {
    expect(signal({ totalUsers: 300 }, "neon-compute").level).toBe("act");
  });

  it("always points at the console, because it cannot measure the real number", () => {
    expect(signal({ totalUsers: 1 }, "neon-compute").link?.href).toContain("neon.tech");
  });
});

describe("storage band", () => {
  it("stays calm at a realistic campus scale", () => {
    // Ten thousand students with seven sections each is still tens of MB,
    // because sections are shared rather than copied per person.
    const s = signal(
      { totalUsers: 10_000, sectionRows: 4_000, meetingRows: 9_000, enrollmentRows: 70_000 },
      "storage",
    );
    expect(s.level).toBe("good");
  });

  it("escalates as the free half-gigabyte fills", () => {
    expect(signal({ totalUsers: 1_500_000 }, "storage").level).toBe("watch");
    expect(signal({ totalUsers: 2_200_000 }, "storage").level).toBe("act");
  });
});

describe("growth band", () => {
  it("is calm on a quiet week", () => {
    expect(signal({ totalUsers: 100, recentSignups: 3 }, "growth").level).toBe("good");
  });

  it("notices a week that adds half the userbase again", () => {
    expect(signal({ totalUsers: 20, recentSignups: 15 }, "growth").level).toBe("watch");
  });

  it("escalates on a frosh-week spike", () => {
    expect(signal({ totalUsers: 400, recentSignups: 250 }, "growth").level).toBe("act");
  });

  it("does not divide by zero on an empty database", () => {
    expect(() => capacitySignals(base)).not.toThrow();
    expect(signal({}, "growth").level).toBe("good");
  });
});

describe("estimates", () => {
  it("counts every table that holds rows", () => {
    const bytes = estimateBytes({ ...base, totalUsers: 1, sectionRows: 1, meetingRows: 1, enrollmentRows: 1 });
    expect(bytes).toBeGreaterThan(0);
  });

  it("formats at a readable scale", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatBytes(2 * 1024 * 1024 * 1024)).toBe("2.00 GB");
  });
});

describe("every signal", () => {
  it("says something in both halves, whatever the numbers", () => {
    for (const input of [base, { ...base, totalUsers: 500, recentSignups: 400 }]) {
      for (const s of capacitySignals(input)) {
        expect(s.reading.length, `${s.id} has no reading`).toBeGreaterThan(0);
        expect(s.advice.length, `${s.id} has no advice`).toBeGreaterThan(0);
      }
    }
  });
});
