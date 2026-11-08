import { redirect } from "next/navigation";
import { BottomNav } from "@/components/shell/bottom-nav";
import { LocaleSync } from "@/components/shell/locale-sync";
import { OfflinePurchaseSync } from "@/components/shell/offline-purchase-sync";
import { isDevHeaderAuthEnabled } from "@/lib/auth/dev-header-auth";
import { resolveIdentity, resolveSession } from "@/lib/auth/session";
import { TenantSelectionRequiredError } from "@/lib/auth/tenant-selection";
import { peopleService } from "@/lib/services";

/** Where a person without a household goes. A session with no invite opens Create. */
async function destinationWithoutHousehold(): Promise<"/invite" | "/signin" | "/create"> {
  const identity = await resolveIdentity();
  if (!identity) {
    return "/signin";
  }
  const invites = await peopleService.listPendingInvites(identity.userId);
  return invites.length > 0 ? "/invite" : "/create";
}

export default async function AppShellLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  if (!isDevHeaderAuthEnabled()) {
    let destination: "/invite" | "/signin" | "/create" | null = null;
    try {
      const session = await resolveSession();
      if (!session) {
        destination = await destinationWithoutHousehold();
      }
    } catch (error: unknown) {
      // Signed in with several households: let the screens ask which one.
      if (!(error instanceof TenantSelectionRequiredError)) {
        throw error;
      }
    }
    if (destination) {
      redirect(destination);
    }
  }

  return (
    <>
      <LocaleSync />
      <OfflinePurchaseSync />
      {children}
      <BottomNav />
    </>
  );
}
