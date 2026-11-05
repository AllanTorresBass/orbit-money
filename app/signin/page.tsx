"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { setActorUserId, setTenantId } from "@/lib/dev/actor-store";
import { HARBOR } from "@/lib/dev/harbor-ids";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("blair@harbor.test");
  const [saving, setSaving] = useState(false);

  async function onContinue(): Promise<void> {
    setSaving(true);
    try {
      const result = await signIn("credentials", {
        email,
        redirect: false,
      });
      if (result?.error) {
        toast.error("No account for that email");
        return;
      }

      // Keep API client headers aligned with the signed-in Harbor users for now.
      const map: Record<string, string> = {
        "alex@harbor.test": HARBOR.alexId,
        "blair@harbor.test": HARBOR.blairId,
        "casey@harbor.test": HARBOR.caseyId,
      };
      const userId = map[email.trim().toLowerCase()];
      if (userId) {
        setActorUserId(userId);
        setTenantId(HARBOR.tenantId);
      }

      toast.success("Signed in");
      router.push("/today");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col px-6 py-16">
      <h1 className="font-[family-name:var(--font-orbit-serif)] text-[28px] text-[var(--orbit-ink)]">
        Orbit
      </h1>
      <label className="mt-12 block text-[15px] text-[var(--orbit-secondary)]">
        Email
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-2 w-full border-b border-[var(--orbit-line)] bg-transparent py-2 text-[17px] text-[var(--orbit-ink)] outline-none"
          placeholder="you@example.com"
        />
      </label>
      <button
        type="button"
        disabled={saving}
        onClick={() => {
          void onContinue();
        }}
        className="mt-10 w-full bg-[var(--orbit-ink)] py-3 text-[17px] text-[var(--orbit-paper)] disabled:opacity-60"
      >
        Continue
      </button>
      <p className="mt-6 text-[13px] text-[var(--orbit-secondary)]">
        Try alex@harbor.test, blair@harbor.test, or casey@harbor.test.
      </p>
    </div>
  );
}
