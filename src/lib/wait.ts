/**
 * Turning a number of minutes into something worth reading on a card.
 *
 * Deliberately vague at the top end. "About 7 hours" is honest and useful;
 * "in 412 minutes" is neither, and a precise number invites someone to sit and
 * refresh until it elapses.
 */

export function formatWait(minutes: number | null | undefined): string | null {
  if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes <= 0) return null;
  const whole = Math.ceil(minutes);
  if (whole < 60) return whole === 1 ? "a minute" : `about ${whole} minutes`;
  const hours = Math.round(whole / 60);
  if (hours <= 1) return "about an hour";
  if (hours >= 24) return "about a day";
  return `about ${hours} hours`;
}
