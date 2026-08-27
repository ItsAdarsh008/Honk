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
 * press ⌘A on", and the signals disagree about that more than you would hope.
 * Pointer media queries turned out to be the unreliable one: headless Chrome
 * reports a coarse primary pointer and ten touch points for a 1280px desktop
 * viewport, and a Windows laptop with a touchscreen reports coarse while
 * sitting in front of a keyboard. So the user-agent decides, and the pointer
 * is only consulted when it has nothing to say.
 *
 * Order matters. iPadOS 13+ sends a desktop Macintosh user-agent, so it has to
 * be caught before the desktop rule claims it.
 */
export function platformFrom(signals: PlatformSignals): Platform {
  const ua = signals.userAgent;
  const fingersOnly = signals.primaryPointerCoarse && !signals.anyPointerFine;

  if (/iPhone|iPod|Android.*Mobile|Windows Phone/i.test(ua)) return "touch";
  if (/iPad|Android(?!.*Mobile)|Tablet|Silk/i.test(ua)) return "touch";
  // An iPad claiming to be a Mac: the absent mouse is the only tell.
  if (/Macintosh/.test(ua) && fingersOnly) return "touch";

  if (/Macintosh|Mac OS X/.test(ua)) return "mac";
  if (/Windows NT|X11|Linux|CrOS/.test(ua)) return "windows";

  // Unrecognised user-agent: now the pointer is the best thing available.
  if (fingersOnly) return "touch";
  return "windows";
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
