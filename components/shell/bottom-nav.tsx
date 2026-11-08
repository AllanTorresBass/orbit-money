"use client";

import { CalendarRange, CircleDot, ListChecks, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export interface BottomNavProps {
  className?: string;
}

const items = [
  { href: "/today", key: "today" as const, Icon: CircleDot },
  { href: "/ahead", key: "ahead" as const, Icon: CalendarRange },
  { href: "/plan", key: "plan" as const, Icon: ListChecks },
  { href: "/you", key: "you" as const, Icon: UserRound },
] as const;

export function BottomNav({ className }: BottomNavProps) {
  const pathname = usePathname();
  const t = useTranslations("nav");

  return (
    <nav
      aria-label={t("primaryAria")}
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-0 z-20 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]",
        className,
      )}
    >
      <ul className="pointer-events-auto mx-auto flex max-w-sm items-center justify-between gap-1 rounded-[1.75rem] border border-[var(--orbit-line)] bg-[color-mix(in_srgb,var(--orbit-surface)_82%,transparent)] p-1.5 shadow-[var(--orbit-shadow)] backdrop-blur-xl">
        {items.map(({ href, key, Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-[1.25rem] py-2 text-[12px] font-medium transition-colors duration-200",
                  active
                    ? "bg-[var(--orbit-brand-soft)] text-[var(--orbit-brand)]"
                    : "text-[var(--orbit-secondary)] hover:text-[var(--orbit-ink)]",
                )}
              >
                <Icon className="size-5" strokeWidth={active ? 2.25 : 1.75} aria-hidden="true" />
                {t(key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
