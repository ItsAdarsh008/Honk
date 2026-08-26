"use client";

/**
 * Sign in: email, then code, then a name if this is the first time.
 *
 * The schedule pasted before signing in is held in sessionStorage and saved as
 * soon as the session exists, so the paste is never lost to the detour.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clearPending, readPending } from "@/lib/pending";
import { formatWait } from "@/lib/wait";

type Step = "email" | "code" | "profile" | "capacity";

/** What a code request did, so each caller can react in its own way. */
type RequestOutcome = "sent" | "capacity" | "error";

export function SignInFlow() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devMode, setDevMode] = useState(false);
  const [hasPending, setHasPending] = useState(false);
  const [retryMinutes, setRetryMinutes] = useState<number | null>(null);

  const codeRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const submittedCode = useRef<string>("");

  useEffect(() => {
    setHasPending(readPending() !== null);
  }, []);

  /** Saves the pasted schedule, then lands the user on /home. */
  const finish = useCallback(async () => {
    const pending = readPending();
    if (pending) {
      try {
        const response = await fetch("/api/schedule", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(pending),
        });
        if (response.ok) clearPending();
      } catch {
        // The schedule stays in sessionStorage; /home offers to paste again.
      }
    }
    router.push("/home");
    router.refresh();
  }, [router]);

  const requestCode = useCallback(async (address: string): Promise<RequestOutcome> => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/request-code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: address }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        mode?: string;
        reason?: string;
        retryAfterMinutes?: number;
      };
      if (!response.ok) {
        setBusy(false);
        if (body.reason === "at_capacity") {
          setRetryMinutes(body.retryAfterMinutes ?? null);
          setError(capacityLine(body.retryAfterMinutes));
          return "capacity";
        }
        setError(body.error ?? "That didn't send. Try again.");
        return "error";
      }
      setDevMode(body.mode === "console");
      setBusy(false);
      return "sent";
    } catch {
      setError("That didn't send. Check your connection and try again.");
      setBusy(false);
      return "error";
    }
  }, []);

  /**
   * Request a code and move to whichever step the outcome calls for. Also the
   * capacity card's retry — the window is rolling, so a slot may have freed.
   */
  const sendCode = useCallback(async () => {
    const outcome = await requestCode(email);
    if (outcome === "sent") {
      setStep("code");
      setCode("");
      submittedCode.current = "";
      requestAnimationFrame(() => codeRef.current?.focus());
      return;
    }
    // Nothing was sent and nothing is coming, so the form would be a lie.
    if (outcome === "capacity") setStep("capacity");
  }, [email, requestCode]);

  const submitEmail = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      await sendCode();
    },
    [sendCode],
  );

  const submitCode = useCallback(
    async (value: string) => {
      if (busy) return;
      submittedCode.current = value;
      setBusy(true);
      setError(null);
      try {
        const response = await fetch("/api/auth/verify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, code: value }),
        });
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
          needsProfile?: boolean;
        };
        if (!response.ok) {
          setError(body.error ?? "That code didn't work.");
          setBusy(false);
          setCode("");
          requestAnimationFrame(() => codeRef.current?.focus());
          return;
        }
        if (body.needsProfile) {
          setStep("profile");
          setBusy(false);
          requestAnimationFrame(() => nameRef.current?.focus());
          return;
        }
        await finish();
      } catch {
        setError("That didn't work. Check your connection and try again.");
        setBusy(false);
      }
    },
    [busy, email, finish],
  );

  // Six digits is the whole form — submit as soon as they are in.
  useEffect(() => {
    if (step === "code" && code.length === 6 && submittedCode.current !== code && !busy) {
      void submitCode(code);
    }
  }, [code, step, busy, submitCode]);

  const submitProfile = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setBusy(true);
      setError(null);
      try {
        const response = await fetch("/api/profile", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ displayName, handle }),
        });
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        if (!response.ok) {
          setError(body.error ?? "That didn't work.");
          setBusy(false);
          return;
        }
        await finish();
      } catch {
        setError("That didn't work. Check your connection and try again.");
        setBusy(false);
      }
    },
    [displayName, handle, finish],
  );

  return (
    <div className="card rise p-6 sm:p-7">
      {step === "email" && (
        <form onSubmit={submitEmail} className="space-y-5">
          <div className="space-y-1.5">
            <h1 className="text-[22px] font-semibold tracking-[-0.015em]">Sign in</h1>
            <p className="text-[15px] text-[var(--ink-soft)]">
              {hasPending
                ? "Your schedule is ready to save. This takes about twenty seconds."
                : "Honk is Waterloo-only, so it needs your school address."}
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="email" className="section-label">
              Waterloo email
            </label>
            <input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoFocus
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jdoe@uwaterloo.ca"
              className="field mono text-[15px]"
            />
          </div>

          <ErrorText error={error} />

          <button className="btn btn-primary w-full" disabled={busy || !email.trim()}>
            {busy ? "Sending…" : "Send me a code"}
          </button>
        </form>
      )}

      {step === "code" && (
        <div className="space-y-5">
          <div className="space-y-1.5">
            <h1 className="text-[22px] font-semibold tracking-[-0.015em]">Check your email</h1>
            <p className="text-[15px] text-[var(--ink-soft)]">
              Six digits, sent to <span className="mono text-[14px]">{email}</span>.
            </p>
          </div>

          {devMode && (
            <p className="rounded-[10px] border border-[var(--border)] bg-[var(--surface-sunken)] px-3 py-2.5 text-[13px] text-[var(--ink-soft)]">
              No email key is set, so the code was printed in the terminal running the
              server.
            </p>
          )}

          <div className="space-y-2">
            <label htmlFor="code" className="section-label">
              Code
            </label>
            <input
              id="code"
              ref={codeRef}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              className="field mono text-center text-[26px] tracking-[0.35em]"
            />
          </div>

          <ErrorText error={error} />

          <div className="flex flex-wrap items-center gap-2">
            <button
              className="btn btn-primary flex-1"
              onClick={() => void submitCode(code)}
              disabled={busy || code.length !== 6}
            >
              {busy ? "Checking…" : "Sign in"}
            </button>
            <button
              className="btn btn-quiet"
              onClick={() => void requestCode(email)}
              disabled={busy}
            >
              Send another
            </button>
          </div>

          <button
            className="text-[14px] text-[var(--ink-soft)] underline-offset-2 hover:underline"
            onClick={() => {
              setStep("email");
              setError(null);
              setCode("");
            }}
          >
            Use a different address
          </button>
        </div>
      )}

      {step === "capacity" && (
        <div className="space-y-5">
          <div className="space-y-1.5">
            <h1 className="text-[22px] font-semibold tracking-[-0.015em]">
              Honk is out of codes for today
            </h1>
            <p className="text-[15px] text-[var(--ink-soft)]">
              There is a daily limit on sign-in emails and today&rsquo;s are gone. Nothing
              is broken and nothing is lost — sign-in opens back up{" "}
              {formatWait(retryMinutes) ? `in ${formatWait(retryMinutes)}` : "shortly"}.
            </p>
          </div>

          {hasPending && (
            <p className="rounded-[10px] border border-[var(--border)] bg-[var(--surface-sunken)] px-3 py-2.5 text-[13px] text-[var(--ink-soft)]">
              Your pasted schedule is still held in this tab. Leave it open and it saves
              the moment you sign in.
            </p>
          )}

          <ErrorText error={error} />

          <div className="flex flex-wrap items-center gap-2">
            <button
              className="btn btn-primary flex-1"
              onClick={() => void sendCode()}
              disabled={busy}
            >
              {busy ? "Checking…" : "Try again"}
            </button>
            <Link href="/paste" className="btn btn-quiet">
              See my week
            </Link>
          </div>

          <p className="text-[13px] text-[var(--ink-faint)]">
            Your week renders without an account. Signing in is only needed to save it
            and to see who you share classes with.
          </p>
        </div>
      )}

      {step === "profile" && (
        <form onSubmit={submitProfile} className="space-y-5">
          <div className="space-y-1.5">
            <h1 className="text-[22px] font-semibold tracking-[-0.015em]">
              What should people call you?
            </h1>
            <p className="text-[15px] text-[var(--ink-soft)]">
              This is what classmates see. That's the only thing Honk needs.
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="displayName" className="section-label">
              Name
            </label>
            <input
              id="displayName"
              ref={nameRef}
              required
              maxLength={40}
              autoComplete="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Jordan Doe"
              className="field"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="handle" className="section-label">
              Handle
            </label>
            <div className="flex items-center gap-2">
              <span className="mono text-[16px] text-[var(--ink-faint)]">@</span>
              <input
                id="handle"
                required
                maxLength={20}
                value={handle}
                onChange={(e) => setHandle(e.target.value.replace(/[^a-zA-Z0-9_]/g, "").toLowerCase())}
                placeholder="jordan"
                className="field mono text-[15px]"
              />
            </div>
          </div>

          <ErrorText error={error} />

          <button
            className="btn btn-primary w-full"
            disabled={busy || !displayName.trim() || handle.length < 2}
          >
            {busy ? "Saving…" : hasPending ? "Save my schedule" : "Done"}
          </button>
        </form>
      )}
    </div>
  );
}

function ErrorText({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p className="text-[14px] text-[#a8442c] dark:text-[#e08b6f]" role="alert">
      {error}
    </p>
  );
}

/** The inline version, for when a code is already in the user's inbox. */
function capacityLine(retryAfterMinutes: number | undefined): string {
  const wait = formatWait(retryAfterMinutes);
  return wait
    ? `Honk is out of sign-in codes for today. Try again in ${wait}.`
    : "Honk is out of sign-in codes for today. Try again later.";
}
