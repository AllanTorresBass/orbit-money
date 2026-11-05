import { redirect } from "next/navigation";
import { BottomNav } from "@/components/shell/bottom-nav";
import { isDevHeaderAuthEnabled } from "@/lib/auth/dev-header-auth";
import { resolveSession } from "@/lib/auth/session";
import { TenantSelectionRequiredError } from "@/lib/auth/tenant-selection";

export default async function AppShellLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  if (!isDevHeaderAuthEnabled()) {
    try {
      const session = await resolveSession();
      if (!session) {
        redirect("/signin");
      }
    } catch (error: unknown) {
      // Signed in with several households: let the screens ask which one.
      if (!(error instanceof TenantSelectionRequiredError)) {
        throw error;
      }
    }
  }

  return (
    <>
      {children}
      <BottomNav />
    </>
  );
}
