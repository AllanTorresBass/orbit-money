import { BottomNav } from "@/components/shell/bottom-nav";

export default function AppShellLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      {children}
      <BottomNav />
    </>
  );
}
