"use client";

/**
 * Sharing an invite link.
 *
 * The app is worth little with one user and much more with every friend added,
 * so the invite is self-motivated — this button is offered where the emptiness
 * is felt, not pushed everywhere.
 */

import { useCallback, useState } from "react";

export function ShareButton({
  handle,
  label = "Share your link",
  variant = "primary",
}: {
  handle: string | null;
  label?: string;
  variant?: "primary" | "secondary";
}) {
  const [copied, setCopied] = useState(false);

  const share = useCallback(async () => {
    const url = handle
      ? `${window.location.origin}/i/${handle}`
      : `${window.location.origin}/`;
    const text =
      "Paste your Quest schedule into Honk — it shows which classes we share and when we are both free.";

    if (navigator.share) {
      try {
        await navigator.share({ title: "Honk", text, url });
        return;
      } catch {
        // Cancelled, or unsupported in this context — fall through to copying.
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      window.prompt("Copy your invite link", url);
    }
  }, [handle]);

  return (
    <button
      className={`btn ${variant === "primary" ? "btn-primary" : "btn-secondary"}`}
      onClick={() => void share()}
    >
      {copied ? "Link copied" : label}
    </button>
  );
}
