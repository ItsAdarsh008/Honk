/**
 * Is this a phone or tablet?
 *
 * Used for one thing: telling somebody on a handheld that the paste needs a
 * laptop. Quest's mobile site has no class schedule page — its Enroll menu
 * offers Add, Drop, Swap, Edit, Enrollment Dates, Class Search and Exam
 * Information and nothing else — so the instructions on the paste screen
 * cannot be followed on a phone at all.
 *
 * The user-agent decides. Pointer media queries look like the principled
 * choice and are not: headless Chrome reports a coarse primary pointer for a
 * desktop viewport, and a Windows laptop with a touchscreen reports coarse
 * while sitting in front of a keyboard. Both would be told to go find a laptop
 * they are already using.
 */
export function isHandheld(userAgent: string, maxTouchPoints: number): boolean {
  if (/iPhone|iPod|iPad/i.test(userAgent)) return true;
  if (/Android|Windows Phone|Silk|Tablet/i.test(userAgent)) return true;
  // iPadOS 13+ sends a desktop Macintosh user-agent. A real Mac reports no
  // touch points, so that is the only reliable tell.
  return /Macintosh/.test(userAgent) && maxTouchPoints > 1;
}
