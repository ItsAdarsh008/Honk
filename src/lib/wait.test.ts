import { describe, expect, it } from "vitest";
import { formatWait } from "./wait";

describe("formatWait", () => {
  it("reads naturally at every scale", () => {
    expect(formatWait(1)).toBe("a minute");
    expect(formatWait(25)).toBe("about 25 minutes");
    expect(formatWait(60)).toBe("about an hour");
    expect(formatWait(200)).toBe("about 3 hours");
    expect(formatWait(1440)).toBe("about a day");
    expect(formatWait(5000)).toBe("about a day");
  });

  it("rounds partial minutes up rather than down to zero", () => {
    expect(formatWait(0.4)).toBe("a minute");
  });

  it("returns null for anything it cannot phrase", () => {
    // The card renders without a time rather than saying "about 0 minutes".
    expect(formatWait(0)).toBeNull();
    expect(formatWait(-5)).toBeNull();
    expect(formatWait(null)).toBeNull();
    expect(formatWait(undefined)).toBeNull();
    expect(formatWait(Number.NaN)).toBeNull();
  });
});
