import { describe, expect, it } from "vitest";
import { questSteps, type Platform } from "./instructions";

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
