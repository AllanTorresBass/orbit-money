import { ORBIT_MARK_CONTENT_ID, ORBIT_MARK_PNG_BASE64 } from "@/lib/email/orbit-mark";
import { escapeHtml, type ResendAttachment } from "@/lib/email/resend";
import { tStatic } from "@/lib/i18n/load-messages";
import { DEFAULT_LOCALE, type AppLocale } from "@/types/i18n/locale.types";

export interface SignInEmail {
  subject: string;
  text: string;
  html: string;
  attachments: ResendAttachment[];
}

/**
 * The magic-link message. Table layout and inline styles so the button and the
 * raw URL survive the clients that strip stylesheets.
 */
export async function renderSignInEmail(input: {
  url: string;
  locale?: AppLocale;
}): Promise<SignInEmail> {
  const locale = input.locale ?? DEFAULT_LOCALE;
  const url = input.url.trim();
  const safeUrl = escapeHtml(url);
  const [
    subject,
    brand,
    bodyLine,
    preheader,
    button,
  ] = await Promise.all([
    tStatic(locale, "emails.signInSubject"),
    tStatic(locale, "common.brand"),
    tStatic(locale, "emails.signInBody"),
    tStatic(locale, "emails.signInPreheader"),
    tStatic(locale, "emails.signInButton"),
  ]);
  const text = [
    subject,
    "",
    bodyLine,
    "",
    url,
    "",
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="${locale}">
  <body style="margin:0;padding:0;background:#F4F1EA;">
    <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
      ${escapeHtml(preheader)}
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F1EA;">
      <tr>
        <td align="center" style="padding:40px 24px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
            <tr>
              <td>
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="vertical-align:middle;padding-right:10px;">
                      <img src="cid:${ORBIT_MARK_CONTENT_ID}" width="32" height="32" alt="" style="display:block;border:0;border-radius:8px;" />
                    </td>
                    <td style="vertical-align:middle;font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:600;line-height:1.2;color:#1C1917;">
                      ${escapeHtml(brand)}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding-top:40px;font-family:Georgia,'Times New Roman',serif;font-size:28px;font-weight:400;line-height:1.2;color:#1C1917;">
                ${escapeHtml(subject)}
              </td>
            </tr>
            <tr>
              <td style="padding-top:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:17px;line-height:1.45;color:#6F6A63;">
                ${escapeHtml(bodyLine)}
              </td>
            </tr>
            <tr>
              <td style="padding-top:40px;">
                <a href="${safeUrl}" style="display:inline-block;background:#1C1917;color:#F4F1EA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:17px;line-height:1;text-decoration:none;padding:18px 24px;border-radius:14px;">${escapeHtml(button)}</a>
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

  return {
    subject,
    text,
    html,
    attachments: [
      {
        filename: "orbit-mark.png",
        content: ORBIT_MARK_PNG_BASE64,
        contentId: ORBIT_MARK_CONTENT_ID,
      },
    ],
  };
}
