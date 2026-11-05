/**
 * Client gate for "Email me a link". Deploy sets NEXT_PUBLIC_MAGIC_LINK=true only when
 * AUTH_RESEND_KEY and AUTH_EMAIL_FROM are also set (see docs/12-deploy.md).
 */
export function isMagicLinkUiEnabled(): boolean {
  return process.env.NEXT_PUBLIC_MAGIC_LINK === "true";
}
