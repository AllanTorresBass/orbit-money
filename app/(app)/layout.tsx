import { redirect } from "next/navigation";
import { BottomNav } from "@/components/shell/bottom-nav";
import { isDevHeaderAuthEnabled } from "@/lib/auth/dev-header-auth";
import { resolveSession } from "@/lib/auth/session";

export default async function AppShellLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  if (!isDevHeaderAuthEnabled()) {
    const session = await resolveSession();
    if (!session) {
      redirect("/signin");
    }
  }

  return (
    <>
      {children}
      <BottomNav />
    </>
  );
}
