"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface BottomNavProps {
  className?: string;
}

const items = [
  { href: "/today", label: "Today" },
  { href: "/ahead", label: "Ahead" },
  { href: "/plan", label: "Plan" },
] as const;

export function BottomNav({ className }: BottomNavProps) {
  const pathname = usePathname();

  return (
    <nav
      className={cn(
        "fixed bottom-0 left-0 right-0 z-20 border-t border-[var(--orbit-line)] bg-[var(--orbit-paper)]",
        className,
      )}
    >
      <div className="mx-auto flex max-w-md items-stretch justify-around px-2 pb-[env(safe-area-inset-bottom)]">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex-1 py-3 text-center text-[15px]",
                active ? "font-medium text-[var(--orbit-ink)]" : "text-[var(--orbit-secondary)]",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
