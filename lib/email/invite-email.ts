import { escapeHtml, sendResendEmail } from "@/lib/email/resend";
import { tStatic } from "@/lib/i18n/load-messages";
import { DEFAULT_LOCALE, type AppLocale } from "@/types/i18n/locale.types";

const INVITE_PATH = "/invite";

/**
 * Where an invited person opens the invite. Absolute when `APP_URL` is set, otherwise the
 * path alone, which the People screen shows as something to copy.
 */
export function buildInviteHint(appUrl: string | undefined = process.env.APP_URL): string {
  const base = appUrl?.trim().replace(/\/+$/, "");
  return base ? `${base}${INVITE_PATH}` : INVITE_PATH;
}

/** Email the invitee a link to `/invite`. Throws when the send fails. */
export async function sendInviteEmail(input: {
  to: string;
  inviteeName: string;
  inviterName: string;
  tenantName: string;
  link: string;
  locale?: AppLocale;
}): Promise<void> {
  const locale = input.locale ?? DEFAULT_LOCALE;
  const inviter = input.inviterName.trim() || (await tStatic(locale, "common.someone"));
  const absolute = input.link.startsWith("http");
  const subject = await tStatic(locale, "emails.inviteSubject", {
    inviter,
    tenantName: input.tenantName,
  });
  const intro = await tStatic(locale, "emails.inviteIntro", {
    inviter,
    tenantName: input.tenantName,
  });
  const text = absolute
    ? await tStatic(locale, "emails.inviteTextAbsolute", {
        inviter,
        tenantName: input.tenantName,
        link: input.link,
      })
    : await tStatic(locale, "emails.inviteTextRelative", {
        inviter,
        tenantName: input.tenantName,
        link: input.link,
      });
  const joinLabel = await tStatic(locale, "emails.inviteJoin", { tenantName: input.tenantName });
  const signInLine = await tStatic(locale, "emails.inviteSignIn");
  const signInThenOpen = await tStatic(locale, "emails.inviteSignInThenOpen", { link: input.link });
  const html = absolute
    ? `<p>${escapeHtml(intro)}</p><p><a href="${escapeHtml(input.link)}">${escapeHtml(joinLabel)}</a></p><p>${escapeHtml(signInLine)}</p>`
    : `<p>${escapeHtml(intro)}</p><p>${escapeHtml(signInThenOpen)}</p>`;
  await sendResendEmail({ to: input.to, subject, text, html });
}
