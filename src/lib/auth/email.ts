import "server-only";

/**
 * Sending sign-in codes.
 *
 * With no `RESEND_API_KEY` the code is printed to the server console instead.
 * That is the intended development path, and the sign-in screen says so out
 * loud rather than leaving you wondering where the email went.
 */

const FROM = process.env.EMAIL_FROM ?? "Honk <onboarding@resend.dev>";

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

export async function sendLoginCode(email: string, code: string): Promise<DeliveryResult> {
  if (!process.env.RESEND_API_KEY) {
    // eslint-disable-next-line no-console
    console.log(
      `\n  Honk sign-in code for ${email}: ${code}\n  (expires in 10 minutes — set RESEND_API_KEY to send this by email instead)\n`,
    );
    return { mode: "console", ok: true };
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: FROM,
      to: email,
      subject: `${code} is your Honk code`,
      text: [
        `Your Honk sign-in code is ${code}.`,
        "",
        "It expires in 10 minutes.",
        "If you didn't ask for this, you can ignore it.",
      ].join("\n"),
      html: codeEmailHtml(code),
    });
    if (error) return failed(error.message);
    return { mode: "email", ok: true };
  } catch (err) {
    return failed(err instanceof Error ? err.message : "send failed");
  }
}

function codeEmailHtml(code: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:32px;background:#FDFBF6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#33322C;">
    <table role="presentation" style="max-width:420px;margin:0 auto;background:#FFFFFF;border:1px solid #EAE5DA;border-radius:16px;">
      <tr>
        <td style="padding:32px;">
          <p style="margin:0 0 24px;font-size:15px;color:#75726A;">Your Honk sign-in code</p>
          <p style="margin:0 0 24px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:34px;letter-spacing:6px;color:#33322C;">${code}</p>
          <p style="margin:0;font-size:14px;color:#75726A;line-height:1.5;">
            It expires in 10 minutes. If you didn't ask for this, you can ignore it.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
