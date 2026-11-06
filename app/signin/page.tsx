"use client";

import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { isClientDevHeaderAuthEnabled } from "@/lib/auth/dev-header-auth";
import { isMagicLinkUiEnabled } from "@/lib/auth/magic-link";
import { setActorUserId, setTenantId } from "@/lib/dev/actor-store";
import { HARBOR } from "@/lib/dev/harbor-ids";
import { OrbitMark } from "@/components/brand/orbit-mark";
import { InlineBanner } from "@/components/shell/inline-banner";

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(
    isClientDevHeaderAuthEnabled() ? "blair@harbor.test" : "",
  );
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: "low" | "short"; text: string } | null>(null);
  const magicLinkEnabled = isMagicLinkUiEnabled();
  const credentialsEnabled = isClientDevHeaderAuthEnabled();

  async function onContinue(): Promise<void> {
    if (!credentialsEnabled) return;
    setSaving(true);
    setNotice(null);
    try {
      const normalized = email.trim().toLowerCase();
      const result = await signIn("credentials", {
        email: normalized,
        redirect: false,
      });
      if (result?.error) {
        // Spec: unknown email goes to Create, not a dead end.
        router.push(`/create?email=${encodeURIComponent(normalized)}`);
        return;
      }

      const map: Record<string, string> = {
        "alex@harbor.test": HARBOR.alexId,
        "blair@harbor.test": HARBOR.blairId,
        "casey@harbor.test": HARBOR.caseyId,
      };
      const userId = map[normalized];
      if (userId) {
        setActorUserId(userId);
        setTenantId(HARBOR.tenantId);
      }

      const callbackUrl = searchParams.get("callbackUrl") ?? "/today";
      router.push(callbackUrl.startsWith("/") ? callbackUrl : "/today");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function onMagicLink(): Promise<void> {
    setSaving(true);
    setNotice(null);
    try {
      const normalized = email.trim().toLowerCase();
      const result = await signIn("resend", {
        email: normalized,
        redirect: false,
        callbackUrl: searchParams.get("callbackUrl") ?? "/today",
      });
      if (result?.error) {
        setNotice({ tone: "short", text: "We could not send that link. Wait a few minutes and try again." });
        return;
      }
      setNotice({
        tone: "low",
        text: "Check your email for a sign-in link. New here? The link opens Create after you confirm.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-16">
      <div className="orbit-reveal" style={{ "--i": 0 } as React.CSSProperties}>
        <OrbitMark wordmark />
        <h1 className="mt-10 text-balance text-[34px] font-semibold leading-[1.1] tracking-tight text-[var(--orbit-ink)]">
          Know what you can spend today.
        </h1>
        <p className="mt-3 text-[16px] leading-relaxed text-[var(--orbit-secondary)]">
          One calm number, paced to your next payday.
        </p>
      </div>
      <label
        className="orbit-reveal mt-10 block text-[14px] font-medium text-[var(--orbit-secondary)]"
        style={{ "--i": 1 } as React.CSSProperties}
      >
        Email
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="orbit-field mt-2"
          placeholder="you@example.com"
        />
      </label>
      {credentialsEnabled ? (
        <button
          type="button"
          disabled={saving}
          onClick={() => {
            void onContinue();
          }}
          className="orbit-btn mt-6 w-full"
        >
          Continue
        </button>
      ) : null}
      {magicLinkEnabled ? (
        <button
          type="button"
          disabled={saving}
          onClick={() => {
            void onMagicLink();
          }}
          className={`w-full ${credentialsEnabled ? "orbit-btn-quiet mt-3" : "orbit-btn mt-6"}`}
        >
          Email me a link
        </button>
      ) : null}
      {!credentialsEnabled && !magicLinkEnabled ? (
        <InlineBanner tone="short" className="mt-10">
          Sign-in is not configured. Set Resend keys and NEXT_PUBLIC_MAGIC_LINK, or enable local
          Harbor header auth.
        </InlineBanner>
      ) : null}
      {notice ? (
        <InlineBanner tone={notice.tone} className="mt-6">
          {notice.text}
        </InlineBanner>
      ) : null}
      {credentialsEnabled ? (
        <p className="mt-6 text-[13px] text-[var(--orbit-secondary)]">
          Local Harbor: try alex@harbor.test, blair@harbor.test, or casey@harbor.test. New email
          opens Create.
        </p>
      ) : (
        <p className="mt-6 text-[13px] text-[var(--orbit-secondary)]">
          New here? Request a link — we will open Create after you confirm your email.
        </p>
      )}
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-md px-5 py-16 text-[var(--orbit-secondary)]">Loading…</div>
      }
    >
      <SignInForm />
    </Suspense>
  );
}
