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

export interface PlatformSignals {
  userAgent: string;
  /** `(pointer: coarse)` — what the *primary* pointer is. */
  primaryPointerCoarse: boolean;
  /** `(any-pointer: fine)` — whether a mouse or trackpad exists at all. */
  anyPointerFine: boolean;
}

/**
 * Which instructions to show.
 *
 * The question is not "is this a small screen" but "is there a keyboard to
 * press ⌘A on". Three signals, because no one of them is enough:
 *
 *  - A phone or tablet user-agent is decisive. Unfashionable, and still the
 *    most reliable thing available for the case that matters most.
 *  - Otherwise a coarse primary pointer *with no fine pointer anywhere* means
 *    fingers only. The second half is what keeps a touchscreen laptop on the
 *    desktop steps: it reports a coarse pointer and has a keyboard regardless.
 *  - Failing both, desktop, split by user-agent only to name the modifier key.
 */
export function platformFrom(signals: PlatformSignals): Platform {
  const ua = signals.userAgent;
  const mobileUa = /iPhone|iPod|Android.*Mobile|Windows Phone/i.test(ua);
  const tabletUa = /iPad|Android(?!.*Mobile)|Tablet/i.test(ua);
  // iPadOS 13+ reports a desktop Mac user-agent; touch with no mouse gives it away.
  const desktopClaimingTouch =
    /Macintosh/.test(ua) && signals.primaryPointerCoarse && !signals.anyPointerFine;

  if (mobileUa || tabletUa || desktopClaimingTouch) return "touch";
  if (signals.primaryPointerCoarse && !signals.anyPointerFine) return "touch";
  return /Mac|iPhone|iPad|iPod/.test(ua) ? "mac" : "windows";
}

/** Reads the signals from the browser. Only called after mount. */
export function detectPlatform(): Platform {
  const media = (query: string) =>
    typeof window.matchMedia === "function" && window.matchMedia(query).matches;
  return platformFrom({
    userAgent: navigator.userAgent ?? "",
    primaryPointerCoarse: media("(pointer: coarse)"),
    anyPointerFine: media("(any-pointer: fine)"),
  });
}
