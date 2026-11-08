import { escapeHtml } from "@/lib/email/resend";

const SUBJECT = "Sign in to Orbit";

export interface SignInEmail {
  subject: string;
  text: string;
  html: string;
}

/**
 * The magic-link message. Table layout and inline styles so the button and the
 * raw URL survive the clients that strip stylesheets.
 */
export function renderSignInEmail(input: { url: string }): SignInEmail {
  const url = input.url.trim();
  const safeUrl = escapeHtml(url);
  const text = [
    SUBJECT,
    "",
    "This link works once, for 24 hours.",
    "If you did not ask for it, you can ignore this message.",
    "",
    url,
    "",
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:0;background:#F4F1EA;">
    <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
      Sign in to Orbit. This link works once, for 24 hours.
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F1EA;">
      <tr>
        <td align="center" style="padding:40px 24px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
            <tr>
              <td style="font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:600;line-height:1.2;color:#1C1917;">
                Orbit
              </td>
            </tr>
            <tr>
              <td style="padding-top:40px;font-family:Georgia,'Times New Roman',serif;font-size:28px;font-weight:400;line-height:1.2;color:#1C1917;">
                Sign in to Orbit
              </td>
            </tr>
            <tr>
              <td style="padding-top:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:17px;line-height:1.45;color:#6F6A63;">
                This link works once, for 24 hours. If you did not ask for it, you can ignore this message.
              </td>
            </tr>
            <tr>
              <td style="padding-top:40px;">
                <a href="${safeUrl}" style="display:inline-block;background:#1C1917;color:#F4F1EA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:17px;line-height:1;text-decoration:none;padding:18px 24px;border-radius:14px;">Sign in</a>
              </td>
            </tr>
            <tr>
              <td style="padding-top:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;line-height:1.45;color:#6F6A63;word-break:break-all;">
                ${safeUrl}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject: SUBJECT, text, html };
}
