import { describe, expect, it } from "vitest";
import { isTouch, platformFrom, questSteps, stepsNote, type Platform } from "./instructions";

const PLATFORMS: Platform[] = ["ios", "android", "mac", "windows"];

const UA = {
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148 Safari/604.1",
  androidPhone: "Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/126.0 Mobile Safari/537.36",
  androidTablet: "Mozilla/5.0 (Linux; Android 14; SM-X200) Chrome/126.0 Safari/537.36",
  ipadOs: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/17.0 Safari/605.1.15",
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/126.0 Safari/537.36",
  windows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0 Safari/537.36",
  linux: "Mozilla/5.0 (X11; Linux x86_64) Chrome/126.0 Safari/537.36",
  cros: "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) Chrome/126.0 Safari/537.36",
};

describe("questSteps", () => {
  it("ends by telling you to paste, everywhere", () => {
    for (const platform of PLATFORMS) {
      expect(questSteps(platform).at(-1)?.toLowerCase()).toContain("paste it above");
    }
  });

  it("gets a phone onto the desktop site first", () => {
    // Quest's mobile site has no class schedule at all: its Enroll menu offers
    // Add, Drop, Swap, Edit, Enrollment Dates, Class Search and Exam
    // Information. Without this step the next one points at nothing.
    for (const platform of ["ios", "android"] as const) {
      const steps = questSteps(platform);
      const desktopStep = steps.findIndex((s) => /desktop site/i.test(s));
      const scheduleStep = steps.findIndex((s) => /My Class Schedule/.test(s));
      expect(desktopStep).toBeGreaterThan(-1);
      expect(desktopStep).toBeLessThan(scheduleStep);
    }
  });

  it("names the right desktop-site control for each phone", () => {
    expect(questSteps("ios").join(" ")).toContain("aA");
    expect(questSteps("android").join(" ")).toContain("⋮");
    expect(questSteps("ios").join(" ")).not.toContain("⋮");
  });

  it("never tells a phone to press a keyboard shortcut", () => {
    for (const platform of ["ios", "android"] as const) {
      const steps = questSteps(platform).join(" ");
      expect(steps).not.toContain("⌘");
      expect(steps).not.toContain("Ctrl");
      expect(steps).toContain("Press and hold");
    }
  });

  it("does not send a desktop through the desktop-site step", () => {
    for (const platform of ["mac", "windows"] as const) {
      expect(questSteps(platform).join(" ")).not.toMatch(/desktop site/i);
    }
  });

  it("names the modifier the desktop actually uses", () => {
    expect(questSteps("mac").join(" ")).toContain("⌘A then ⌘C");
    expect(questSteps("windows").join(" ")).toContain("Ctrl+A then Ctrl+C");
    expect(questSteps("mac").join(" ")).not.toContain("Ctrl");
  });

  it("explains the desktop-site step only where it appears", () => {
    expect(stepsNote("ios")).toContain("mobile site has no class schedule");
    expect(stepsNote("android")).not.toBeNull();
    expect(stepsNote("mac")).toBeNull();
    expect(stepsNote("windows")).toBeNull();
  });
});

describe("platformFrom", () => {
  const fingersOnly = { primaryPointerCoarse: true, anyPointerFine: false, maxTouchPoints: 5 };
  const desktop = { primaryPointerCoarse: false, anyPointerFine: true, maxTouchPoints: 0 };

  it("separates iOS from Android, because the browser control differs", () => {
    expect(platformFrom({ userAgent: UA.iphone, ...fingersOnly })).toBe("ios");
    expect(platformFrom({ userAgent: UA.androidPhone, ...fingersOnly })).toBe("android");
    expect(platformFrom({ userAgent: UA.androidTablet, ...fingersOnly })).toBe("android");
  });

  it("catches an iPad pretending to be a Mac", () => {
    expect(platformFrom({ userAgent: UA.ipadOs, ...fingersOnly })).toBe("ios");
    expect(platformFrom({ userAgent: UA.mac, ...desktop })).toBe("mac");
  });

  it("trusts a desktop user-agent over pointer signals that look like a phone", () => {
    // Headless Chrome and a touchscreen laptop both report exactly this.
    const looksLikeAPhone = { primaryPointerCoarse: true, anyPointerFine: false, maxTouchPoints: 10 };
    expect(platformFrom({ userAgent: UA.windows, ...looksLikeAPhone })).toBe("windows");
    expect(platformFrom({ userAgent: UA.linux, ...looksLikeAPhone })).toBe("windows");
    expect(platformFrom({ userAgent: UA.cros, ...looksLikeAPhone })).toBe("windows");
    // A Mac with no touch points stays a Mac however coarse it claims to be.
    expect(platformFrom({ userAgent: UA.mac, ...looksLikeAPhone, maxTouchPoints: 0 })).toBe("mac");
  });

  it("falls back to the pointer only for an unrecognised user-agent", () => {
    expect(platformFrom({ userAgent: "", ...fingersOnly })).toBe("android");
    expect(platformFrom({ userAgent: "", ...desktop })).toBe("windows");
  });
});

describe("isTouch", () => {
  it("is true for exactly the two phone platforms", () => {
    expect(PLATFORMS.filter(isTouch)).toEqual(["ios", "android"]);
  });
});
