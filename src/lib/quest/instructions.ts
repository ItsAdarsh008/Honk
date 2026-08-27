/**
 * How to get a schedule out of Quest, which is not the same on a phone.
 *
 * "Select the whole page and copy it" is desktop advice — there is no select-all
 * without a keyboard, and the gesture that replaces it is press-and-hold, which
 * nobody guesses on a page this long. Getting this wrong on mobile is expensive:
 * SPEC section 1 says the paste has to be one step, and a student between
 * classes has no laptop to fall back to.
 */

export type Platform = "touch" | "mac" | "windows";

/** What the copy shortcut is called on the machine in front of you. */
function shortcut(platform: Platform): string {
  return platform === "mac" ? "⌘A then ⌘C" : "Ctrl+A then Ctrl+C";
}

export function questSteps(platform: Platform): string[] {
  const common = ["Open Quest and go to Enroll → My Class Schedule.", "Switch to List View."];

  if (platform === "touch") {
    return [
      ...common,
      "Press and hold anywhere on the schedule, then choose Select All.",
      "Tap Copy, come back here, and paste it above.",
    ];
  }

  return [...common, `Select the whole page and copy it — ${shortcut(platform)}.`, "Paste it above."];
}

/**
 * Read the platform from the browser.
 *
 * Pointer type over user-agent sniffing: a tablet with a keyboard and a laptop
 * with a touchscreen both exist, and what actually decides the instructions is
 * whether there is a keyboard to press ⌘A on. Only called in the browser.
 */
export function detectPlatform(): Platform {
  const coarse =
    typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
  const touchPoints = navigator.maxTouchPoints ?? 0;
  if (coarse && touchPoints > 0) return "touch";

  const ua = navigator.userAgent ?? "";
  return /Mac|iPhone|iPad|iPod/.test(ua) ? "mac" : "windows";
}
