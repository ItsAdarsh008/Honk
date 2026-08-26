import "server-only";

/**
 * The one-time challenge, parked in an httpOnly cookie between the two halves
 * of a WebAuthn ceremony. Short-lived and cleared on use: a replayed challenge
 * is the thing the ceremony exists to prevent.
 */

import { cookies } from "next/headers";

const REGISTER = "honk_pk_reg";
const SIGNIN = "honk_pk_in";
const TTL_SECONDS = 5 * 60;

type Kind = "register" | "signin";
const NAME: Record<Kind, string> = { register: REGISTER, signin: SIGNIN };

export async function setChallenge(kind: Kind, value: string): Promise<void> {
  const jar = await cookies();
  jar.set(NAME[kind], value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: TTL_SECONDS,
  });
}

export async function takeChallenge(kind: Kind): Promise<string | null> {
  const jar = await cookies();
  const value = jar.get(NAME[kind])?.value ?? null;
  jar.delete(NAME[kind]);
  return value;
}
