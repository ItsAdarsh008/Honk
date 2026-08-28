import "server-only";
import { siteUrl } from "../site";
import { liveSchoolList } from "../schools";
import { formatWait } from "../wait";
import { CODE_TTL_MINUTES } from "./session";

/**
 * Sending sign-in codes.
 *
 * With no `RESEND_API_KEY` the code is printed to the server console instead.
 * That is the intended development path, and the sign-in screen says so out
 * loud rather than leaving you wondering where the email went.
 */

const FROM = process.env.EMAIL_FROM ?? "Honk <onboarding@resend.dev>";

/**
 * Where a reply should go.
 *
 * The From address cannot receive anything — `send.adarshthoduvakkal.com`
 * publishes a null MX (RFC 7505), which is the standards-compliant way for a
 * send-only domain to say so out loud. That is deliberate: an unexplained
 * missing MX reads as suspicious to a filter, while a null MX reads as a
 * transactional sender behaving normally, and a reply bounces immediately with
 * a clear error instead of vanishing.
 *
 * Set `EMAIL_REPLY_TO` to an address somebody actually reads and replies land
 * there instead. Unset, the mail simply does not invite one.
 */
function replyTo(): string | null {
  return process.env.EMAIL_REPLY_TO?.trim() || null;
}

/** "about an hour", from the one constant, so the copy cannot drift from it. */
function lifetime(): string {
  return formatWait(CODE_TTL_MINUTES) ?? `${CODE_TTL_MINUTES} minutes`;
}

export type DeliveryMode = "email" | "console";

/**
 * `capacity` means the provider refused because a quota or rate limit was hit,
 * which is a different thing to tell the user than a transient failure: one is
 * "come back later", the other is "try again now". Honk's own daily cap should
 * trip first, so this is the backstop for a cap set higher than the plan
 * actually allows.
 */
export type DeliveryFailure = "capacity" | "other";

export interface DeliveryResult {
  mode: DeliveryMode;
  ok: boolean;
  error?: string;
  reason?: DeliveryFailure;
}

const CAPACITY_PATTERN = /rate.?limit|quota|too many|daily limit|exceeded/i;

export function classifyFailure(message: string): DeliveryFailure {
  return CAPACITY_PATTERN.test(message) ? "capacity" : "other";
}

function failed(message: string): DeliveryResult {
  return { mode: "email", ok: false, error: message, reason: classifyFailure(message) };
}

export function deliveryMode(): DeliveryMode {
  return process.env.RESEND_API_KEY ? "email" : "console";
}

/**
 * Why this email is wordier than a code needs to be.
 *
 * The first real sends were accepted by both Gmail and Waterloo's gateway and
 * then filtered out of sight. Authentication was never the problem — SPF, DKIM
 * and DMARC all pass. The problem is that a six-digit number, alone, from a
 * domain with no sending history, is shaped exactly like the phishing it is
 * hardest to tell apart from.
 *
 * So: the subject leads with a word rather than a bare number, the body says
 * what Honk is and why this arrived, text and HTML say the same things, and
 * there is a real link to a real site. None of it outweighs reputation, which
 * only volume over time earns — but it stops the content itself counting
 * against a domain that has no credit to spend.
 */
export async function sendLoginCode(email: string, code: string): Promise<DeliveryResult> {
  if (!process.env.RESEND_API_KEY) {
    // eslint-disable-next-line no-console
    console.log(
      `\n  Honk sign-in code for ${email}: ${code}\n  (expires in ${lifetime()} — set RESEND_API_KEY to send this by email instead)\n`,
    );
    return { mode: "console", ok: true };
  }

  const site = siteUrl();
  const host = site.replace(/^https?:\/\//, "");

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: FROM,
      to: email,
      subject: `Your Honk code is ${code}`,
      text: codeEmailText(code, site, host),
      html: codeEmailHtml(code, site, host),
      // Gmail collapses same-subject mail into one thread, which buries a new
      // code under an old one. A unique ref per send keeps them separate.
      headers: { "X-Entity-Ref-ID": `honk-code-${code}` },
      ...(replyTo() ? { replyTo: replyTo()! } : {}),
    });
    if (error) return failed(error.message);
    return { mode: "email", ok: true };
  } catch (err) {
    return failed(err instanceof Error ? err.message : "send failed");
  }
}

function codeEmailText(code: string, site: string, host: string): string {
  return [
    `Your Honk sign-in code is ${code}`,
    "",
    `Enter it at ${site} to finish signing in.`,
    `It expires in ${lifetime()} and works once.`,
    "",
    "You are getting this because someone entered this address on Honk, the",
    `class-schedule app for students at ${liveSchoolList()}. If that was`,
    "not you, ignore this email — no account is created and nothing changes.",
    "",
    `Honk · ${host}`,
  ].join("\n");
}

function codeEmailHtml(code: string, site: string, host: string): string {
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:32px;background:#FDFBF6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#33322C;">
    <table role="presentation" style="max-width:440px;margin:0 auto;background:#FFFFFF;border:1px solid #EAE5DA;border-radius:16px;">
      <tr>
        <td style="padding:32px;">
          <p style="margin:0 0 20px;font-size:15px;color:#75726A;">Your Honk sign-in code</p>
          <p style="margin:0 0 20px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:34px;letter-spacing:6px;color:#33322C;">${code}</p>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.5;color:#33322C;">
            Enter it at <a href="${site}" style="color:#33322C;">${host}</a> to finish signing in.
            It expires in ${lifetime()} and works once.
          </p>
          <p style="margin:0;font-size:14px;line-height:1.5;color:#75726A;">
            You are getting this because someone entered this address on Honk, the
            class-schedule app for students at ${liveSchoolList()}. If that was not you,
            ignore this email — no account is created and nothing changes.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:0 32px 24px;">
          <p style="margin:0;font-size:12px;color:#A6A299;">Honk · ${host}</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
