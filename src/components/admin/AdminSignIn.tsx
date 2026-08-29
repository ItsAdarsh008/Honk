"use client";

/**
 * The admin door.
 *
 * Deliberately plain and deliberately unhelpful about what went wrong: a wrong
 * address and a wrong password say the same thing, because there is no reason
 * to tell a stranger which half they guessed right.
 */

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

export function AdminSignIn() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setBusy(true);
      setError(null);
      try {
        const response = await fetch("/api/admin/signin", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          setError(body.error ?? "That didn't work.");
          setBusy(false);
          return;
        }
        router.refresh();
      } catch {
        setError("That didn't work. Check your connection.");
        setBusy(false);
      }
    },
    [email, password, router],
  );

  return (
    <form onSubmit={submit} className="card mx-auto max-w-sm space-y-5 p-6">
      <div className="space-y-1.5">
        <h1 className="text-[22px] font-semibold tracking-[-0.015em]">Admin</h1>
        <p className="text-[15px] text-[var(--ink-soft)]">
          Not a student sign-in. This one is the pair in <span className="mono">.env.local</span>.
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor="admin-email" className="section-label">
          Email
        </label>
        <input
          id="admin-email"
          type="email"
          autoComplete="username"
          autoFocus
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="field mono text-[15px]"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="admin-password" className="section-label">
          Password
        </label>
        <input
          id="admin-password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="field text-[15px]"
        />
      </div>

      {error && (
        <p className="text-[14px] text-[#a8442c] dark:text-[#e08b6f]" role="alert">
          {error}
        </p>
      )}

      <button className="btn btn-primary w-full" disabled={busy || !email || !password}>
        {busy ? "Checking…" : "Open the dashboard"}
      </button>
    </form>
  );
}
