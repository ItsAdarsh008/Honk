import { fail, json, readAddress, readJson, requireDatabase } from "@/app/api/_lib";
import { createSession, hasProfile, verifyLoginCode } from "@/lib/auth/session";

export const runtime = "nodejs";

const MESSAGES: Record<string, string> = {
  no_code: "That code has expired or was already used. Ask for a new one.",
  expired: "That code has expired. Ask for a new one.",
  too_many_attempts: "Too many tries on that code. Ask for a new one.",
  wrong_code: "That code doesn't match. Check the email and try again.",
};

export async function POST(request: Request) {
  const body = await readJson<{ email?: string; code?: string }>(request);
  const address = readAddress(body?.email);
  if (!address.ok) return address.response;
  const email = address.email;
  const code = (body?.code ?? "").replace(/\D/g, "");
  if (code.length !== 6) return fail("A code is six digits.");

  const unavailable = requireDatabase();
  if (unavailable) return unavailable;

  const result = await verifyLoginCode(email, code);
  if (!result.ok) {
    return fail(MESSAGES[result.reason] ?? "That didn't work. Ask for a new code.", 401);
  }

  await createSession(result.user.id);

  return json({
    ok: true,
    needsProfile: !hasProfile(result.user),
    needsPrivacyPrompt: result.user.privacyPromptedAt === null,
  });
}
