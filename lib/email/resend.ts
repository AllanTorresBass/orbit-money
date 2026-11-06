import { logger } from "@/lib/logger";

/** True when both Resend settings are present, so mail can be sent. */
export function isEmailConfigured(): boolean {
  return Boolean(process.env.AUTH_RESEND_KEY && process.env.AUTH_EMAIL_FROM);
}

/** Escape text for an HTML email body. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface ResendMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Send one message through the Resend REST API. `apiKey` and `from` default to the
 * deployment settings. Throws on a non-2xx answer; the caller decides whether that matters.
 */
export async function sendResendEmail(
  message: ResendMessage,
  options?: { apiKey?: string; from?: string },
): Promise<void> {
  const apiKey = options?.apiKey ?? process.env.AUTH_RESEND_KEY;
  const from = options?.from ?? process.env.AUTH_EMAIL_FROM;
  if (!apiKey || !from) {
    throw new Error("Email is not configured");
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, ...message }),
  });
  if (!res.ok) {
    const body = await res.text();
    logger.error("Resend send failed", { status: res.status, body });
    throw new Error("Email send failed");
  }
}
