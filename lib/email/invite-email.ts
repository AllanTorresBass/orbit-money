import { escapeHtml, sendResendEmail } from "@/lib/email/resend";

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
}): Promise<void> {
  const inviter = input.inviterName.trim() || "Someone";
  const subject = `${inviter} invited you to ${input.tenantName} on Orbit`;
  const absolute = input.link.startsWith("http");
  const text = absolute
    ? `${inviter} invited you to ${input.tenantName} on Orbit.\nSign in with this email address and join:\n${input.link}\n`
    : `${inviter} invited you to ${input.tenantName} on Orbit.\nSign in with this email address, then open ${input.link} to join.\n`;
  const html = absolute
    ? `<p>${escapeHtml(inviter)} invited you to ${escapeHtml(input.tenantName)} on Orbit.</p><p><a href="${escapeHtml(input.link)}">Join ${escapeHtml(input.tenantName)}</a></p><p>Sign in with this email address.</p>`
    : `<p>${escapeHtml(inviter)} invited you to ${escapeHtml(input.tenantName)} on Orbit.</p><p>Sign in with this email address, then open ${escapeHtml(input.link)} to join.</p>`;
  await sendResendEmail({ to: input.to, subject, text, html });
}
