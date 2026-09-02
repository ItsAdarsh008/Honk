"use client";

/**
 * Your invite link as a QR code, on a phone, in person.
 *
 * The share sheet is the right tool for someone who is not standing in front
 * of you. During frosh week nobody is: you are in a hallway with a person you
 * have known for ninety seconds, and the fastest path from that to a friend on
 * Honk is holding up a screen for them to point a camera at. No typing a
 * handle, no asking for a number first, no "what's your Instagram".
 *
 * **Phone only, and that is not an arbitrary restriction.** The code has to be
 * on the screen being held up. A laptop cannot be held up, and a QR code on a
 * monitor is a worse version of the link that is already in the address bar —
 * so it is hidden above the phone breakpoint rather than rendered and ignored.
 *
 * Rendered locally as an SVG. The obvious shortcut is an image URL from one of
 * the free QR services, and it would mean posting every student's invite link
 * to a third party to draw a square.
 */

import { useCallback, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

export function QrInvite({ handle }: { handle: string | null }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);

  /*
   * Read on the client, because the origin is what makes the code scannable
   * and the server does not reliably know which one this page was reached on.
   */
  useEffect(() => {
    setUrl(handle ? `${window.location.origin}/i/${handle}` : window.location.origin);
  }, [handle]);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    // The sheet covers the page; letting what is underneath scroll behind it
    // is how a code being held up slides off the screen mid-scan.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, close]);

  return (
    <>
      <button
        type="button"
        className="qr-button"
        onClick={() => setOpen(true)}
        aria-label="Show my invite QR code"
      >
        <QrGlyph />
      </button>

      {open && (
        <div
          className="qr-sheet"
          role="dialog"
          aria-modal="true"
          aria-label="Your invite code"
          onClick={close}
        >
          <div className="qr-card" onClick={(event) => event.stopPropagation()}>
            <p className="text-[17px] font-semibold">Scan to add me</p>
            <p className="text-[14px] text-[var(--ink-soft)]">
              Point a camera at this. It opens Honk with your schedule already waiting.
            </p>

            <div className="qr-code">
              {url && (
                <QRCodeSVG
                  value={url}
                  size={232}
                  level="M"
                  marginSize={0}
                  bgColor="#FFFFFF"
                  fgColor="#33322C"
                />
              )}
            </div>

            {handle && <p className="mono text-[13px] text-[var(--ink-faint)]">@{handle}</p>}

            <button className="btn btn-secondary w-full" onClick={close}>
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function QrGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M3 3h5v5H3V3Zm9 0h5v5h-5V3ZM3 12h5v5H3v-5Zm9 3h2v2h-2v-2Zm3-3h2v2h-2v-2Zm-3 0h2v2h-2v-2Zm3 3h2v2h-2v-2Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
