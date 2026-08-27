import { describe, expect, it } from "vitest";
import { platformFrom, questSteps, type Platform } from "./instructions";

const PLATFORMS: Platform[] = ["touch", "mac", "windows"];

describe("questSteps", () => {
  it("always starts in the same place, whatever the device", () => {
    for (const platform of PLATFORMS) {
      const steps = questSteps(platform);
      expect(steps[0]).toContain("My Class Schedule");
      expect(steps[1]).toContain("List View");
    }
  });

  it("never tells a phone to press a keyboard shortcut", () => {
    // The whole point: there is no ⌘A without a keyboard.
    const steps = questSteps("touch").join(" ");
    expect(steps).not.toContain("⌘");
    expect(steps).not.toContain("Ctrl");
    expect(steps).toContain("Press and hold");
  });

  it("names the right modifier on each desktop", () => {
    expect(questSteps("mac").join(" ")).toContain("⌘A then ⌘C");
    expect(questSteps("windows").join(" ")).toContain("Ctrl+A then Ctrl+C");
    expect(questSteps("mac").join(" ")).not.toContain("Ctrl");
  });

  it("ends by telling you to paste, on every platform", () => {
    for (const platform of PLATFORMS) {
      expect(questSteps(platform).at(-1)?.toLowerCase()).toContain("paste it above");
    }
  });
});

const UA = {
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148 Safari/604.1",
  androidPhone: "Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/126.0 Mobile Safari/537.36",
  androidTablet: "Mozilla/5.0 (Linux; Android 14; SM-X200) Chrome/126.0 Safari/537.36",
  ipadOs: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/17.0 Safari/605.1.15",
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/126.0 Safari/537.36",
  windows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0 Safari/537.36",
};

describe("platformFrom", () => {
  it("reads a phone as touch", () => {
    for (const ua of [UA.iphone, UA.androidPhone]) {
      expect(
        platformFrom({ userAgent: ua, primaryPointerCoarse: true, anyPointerFine: false, maxTouchPoints: 5 }),
      ).toBe("touch");
    }
  });

  it("reads a tablet as touch", () => {
    expect(
      platformFrom({ userAgent: UA.androidTablet, primaryPointerCoarse: true, anyPointerFine: false, maxTouchPoints: 5 }),
    ).toBe("touch");
  });

  it("keeps a touchscreen laptop on the desktop steps", () => {
    // The bug this heuristic exists for: a coarse pointer is present, but so is
    // a trackpad, and the keyboard shortcut is the faster instruction.
    expect(
      platformFrom({ userAgent: UA.windows, primaryPointerCoarse: true, anyPointerFine: true, maxTouchPoints: 10 }),
    ).toBe("windows");
  });

  it("catches an iPad pretending to be a Mac", () => {
    // iPadOS 13+ sends a desktop Macintosh user-agent; no mouse gives it away.
    expect(
      platformFrom({ userAgent: UA.ipadOs, primaryPointerCoarse: true, anyPointerFine: false, maxTouchPoints: 5 }),
    ).toBe("touch");
    // A real Mac with a trackpad must not be caught by that rule.
    expect(
      platformFrom({ userAgent: UA.mac, primaryPointerCoarse: false, anyPointerFine: true, maxTouchPoints: 0 }),
    ).toBe("mac");
  });

  it("names the modifier from the desktop it is on", () => {
    const desktop = { primaryPointerCoarse: false, anyPointerFine: true, maxTouchPoints: 0 };
    expect(platformFrom({ userAgent: UA.mac, ...desktop })).toBe("mac");
    expect(platformFrom({ userAgent: UA.windows, ...desktop })).toBe("windows");
  });

  it("falls back to desktop when the browser reports nothing useful", () => {
    // Media queries can be unavailable; the desktop steps are the safer default
    // because they are also what a crawler and a no-JS reader see.
    expect(
      platformFrom({ userAgent: "", primaryPointerCoarse: false, anyPointerFine: false, maxTouchPoints: 0 }),
    ).toBe("windows");
  });
});

describe("platformFrom, when the pointer signals lie", () => {
  // Both of these report a coarse primary pointer and no fine pointer, which is
  // what a phone looks like. Neither is one.
  const looksLikeAPhone = { primaryPointerCoarse: true, anyPointerFine: false, maxTouchPoints: 10 };

  it("trusts a desktop user-agent over the pointer", () => {
    expect(platformFrom({ userAgent: UA.windows, ...looksLikeAPhone })).toBe("windows");
    // A Mac reporting phone-like pointers is still a Mac: zero touch points.
    expect(
      platformFrom({ ...looksLikeAPhone, userAgent: UA.mac, maxTouchPoints: 0 }),
    ).toBe("mac");
  });

  it("still catches a real phone when the pointer agrees", () => {
    expect(platformFrom({ userAgent: UA.iphone, ...looksLikeAPhone })).toBe("touch");
  });

  it("reads Linux and ChromeOS as desktops", () => {
    const linux = "Mozilla/5.0 (X11; Linux x86_64) Chrome/126.0 Safari/537.36";
    const cros = "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) Chrome/126.0 Safari/537.36";
    expect(platformFrom({ userAgent: linux, ...looksLikeAPhone })).toBe("windows");
    expect(platformFrom({ userAgent: cros, ...looksLikeAPhone })).toBe("windows");
  });
});
