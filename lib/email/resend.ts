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

export interface ResendAttachment {
  filename: string;
  /** Base64 file bytes. */
  content: string;
  /** Referenced from the HTML as `cid:<contentId>`. */
  contentId?: string;
}

export interface ResendMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments?: ResendAttachment[];
}

function readResendId(value: unknown): string | null {
  if (typeof value !== "object" || value === null || !("id" in value)) {
    return null;
  }
  const id = value.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

/**
 * Send one message through the Resend REST API. `apiKey` and `from` default to the
 * deployment settings. Returns Resend's message id. Throws on a non-2xx answer;
 * the caller decides whether that matters.
 */
export async function sendResendEmail(
  message: ResendMessage,
  options?: { apiKey?: string; from?: string },
): Promise<string | null> {
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
    body: JSON.stringify({
      from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      attachments: message.attachments?.map((item) => ({
        filename: item.filename,
        content: item.content,
        content_id: item.contentId,
      })),
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    logger.error("Resend send failed", { status: res.status, body });
    throw new Error("Email send failed");
  }

  try {
    return readResendId(await res.json());
  } catch (error: unknown) {
    logger.warn("Resend accepted the message without a readable id", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return null;
  }
}
