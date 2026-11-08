import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { escapeHtml } from "@/lib/email/resend";
import { renderSignInEmail } from "@/lib/email/sign-in-email";

const HOSTILE_URL =
  'https://orbit.example/callback?token=1&next="><script>alert(1)</script>';

describe("renderSignInEmail", () => {
  it("keeps the subject free of the link and escapes a hostile URL", () => {
    const message = renderSignInEmail({ url: HOSTILE_URL });

    expect(message.subject).toBe("Sign in to Orbit");
    expect(message.subject).not.toContain("token");
    expect(message.text).toContain(HOSTILE_URL);
    expect(message.html).toContain(`href="${escapeHtml(HOSTILE_URL)}"`);
    expect(message.html).toContain(escapeHtml(HOSTILE_URL));
    expect(message.html).not.toContain("<script>");
    expect(message.html).toContain(">Sign in<");
    expect(message.html).toContain('src="cid:orbit-mark"');
    expect(message.attachments[0]?.contentId).toBe("orbit-mark");
    expect(message.attachments[0]?.content).toBe(
      readFileSync("lib/email/orbit-mark.png").toString("base64"),
    );
    expect(message.html).toContain("This link works once, for 24 hours");
  });
});
