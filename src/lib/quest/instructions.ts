/**
 * How to get a schedule out of Quest, which is genuinely different on a phone.
 *
 * Quest's mobile site has no class schedule. The Enroll menu there offers Add,
 * Drop, Swap, Edit, Enrollment Dates, Class Search and Exam Information — and
 * that is all. "Enroll → My Class Schedule" is desktop-only, so the desktop
 * instructions were not merely awkward on a phone, they pointed at a menu item
 * that does not exist.
 *
 * So the mobile route is to ask the browser for the desktop site first. That is
 * not a workaround for small text — it is the only way to reach the page at
 * all, and it has a second benefit: the parser was built against the desktop
 * List View's markup, where every cell copies onto its own line. Whatever
 * mobile Quest would produce is untested and probably shaped differently.
 * Nothing is lost by zooming out, because the page is never read — it is
 * selected and copied.
 *
 * Requesting the desktop site is in a different place on each phone, hence the
 * split between iOS and Android rather than one "mobile".
 */

export type Platform = "ios" | "android" | "mac" | "windows";

export type TouchPlatform = "ios" | "android";

export function isTouch(platform: Platform): platform is TouchPlatform {
  return platform === "ios" || platform === "android";
}

const DESKTOP_SITE: Record<TouchPlatform, string> = {
  ios: "Turn on the desktop site — “aA” in the address bar in Safari, or “…” in Chrome.",
  android: "Tap “⋮” in the corner and tick “Desktop site”.",
};

export function questSteps(platform: Platform): string[] {
  if (isTouch(platform)) {
    return [
      "Open Quest in your browser and sign in.",
      DESKTOP_SITE[platform],
      "Go to Enroll → My Class Schedule, then switch to List View.",
      "Press and hold the page, choose Select All, then Copy.",
      "Come back here and paste it above.",
    ];
  }

  const shortcut = platform === "mac" ? "⌘A then ⌘C" : "Ctrl+A then Ctrl+C";
  return [
    "Open Quest and go to Enroll → My Class Schedule.",
    "Switch to List View.",
    `Select the whole page and copy it — ${shortcut}.`,
    "Paste it above.",
  ];
}

/** Why step two exists, said once rather than inside a numbered step. */
export function stepsNote(platform: Platform): string | null {
  if (!isTouch(platform)) return null;
  return "Quest's mobile site has no class schedule — the desktop one is the only place it exists.";
}

export interface PlatformSignals {
  userAgent: string;
  /** `(pointer: coarse)` — what the *primary* pointer is. */
  primaryPointerCoarse: boolean;
  /** `(any-pointer: fine)` — whether a mouse or trackpad exists at all. */
  anyPointerFine: boolean;
  /** `navigator.maxTouchPoints`. A real Mac reports 0; an iPad reports 5. */
  maxTouchPoints: number;
}

/**
 * Which instructions to show.
 *
 * The user-agent decides, because the pointer signals proved unreliable:
 * headless Chrome reports a coarse primary pointer and ten touch points for a
 * desktop viewport, and a Windows laptop with a touchscreen reports coarse
 * while sitting in front of a keyboard. The pointer is consulted only for a
 * user-agent nothing else recognises.
 *
 * Order matters. iPadOS 13+ sends a desktop Macintosh user-agent, so it has to
 * be caught before the desktop rule claims it — and touch points are the tell,
 * since a real Mac reports 0 however coarse it calls its pointer.
 */
export function platformFrom(signals: PlatformSignals): Platform {
  const ua = signals.userAgent;

  if (/iPhone|iPod/i.test(ua)) return "ios";
  if (/iPad/i.test(ua)) return "ios";
  if (/Macintosh/.test(ua) && signals.maxTouchPoints > 1) return "ios";
  if (/Android|Windows Phone|Silk|Tablet/i.test(ua)) return "android";

  if (/Macintosh|Mac OS X/.test(ua)) return "mac";
  if (/Windows NT|X11|Linux|CrOS/.test(ua)) return "windows";

  // Unrecognised: now the pointer is the best thing left.
  return signals.primaryPointerCoarse && !signals.anyPointerFine ? "android" : "windows";
}

/** Reads the signals from the browser. Only called after mount. */
export function detectPlatform(): Platform {
  const media = (query: string) =>
    typeof window.matchMedia === "function" && window.matchMedia(query).matches;
  return platformFrom({
    userAgent: navigator.userAgent ?? "",
    primaryPointerCoarse: media("(pointer: coarse)"),
    anyPointerFine: media("(any-pointer: fine)"),
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
  });
}
