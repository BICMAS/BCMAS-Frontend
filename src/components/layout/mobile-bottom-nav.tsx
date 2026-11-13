"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { isNavItemActive } from "@/lib/navigation";
import type { MobileTab } from "@/types/navigation";
import { cn } from "@/lib/utils";

type MobileBottomNavProps = {
  tabs: MobileTab[];
  className?: string;
};

export function MobileBottomNav({ tabs, className }: MobileBottomNavProps) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Mobile primary"
      className={cn(
        "sticky bottom-0 z-40 flex h-16 items-center justify-around border-t border-border-slate bg-white px-4 lg:hidden",
        className,
      )}
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = isNavItemActive(pathname, tab);

        return (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex flex-col items-center gap-1",
              active ? "text-navy" : "text-slate-400",
            )}
          >
            <Icon className="size-3.5" aria-hidden />
            <span className="text-[9px] font-bold tracking-tight uppercase">
              {tab.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
