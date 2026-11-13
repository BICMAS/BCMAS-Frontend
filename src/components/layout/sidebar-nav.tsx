"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDownIcon } from "lucide-react";

import {
  findActiveSectionItemIds,
  isNavItemActive,
} from "@/lib/navigation";
import type { NavItem, NavSection } from "@/types/navigation";
import { cn } from "@/lib/utils";

type SidebarNavProps = {
  sections: NavSection[];
  collapsed?: boolean;
  variant?: "tenant" | "platform";
  onNavigate?: () => void;
};

function NavLink({
  item,
  collapsed,
  variant,
  active,
  nested = false,
  onNavigate,
}: {
  item: NavItem;
  collapsed?: boolean;
  variant: "tenant" | "platform";
  active: boolean;
  nested?: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  const isPlatform = variant === "platform";

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      className={cn(
        "sidebar-item flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm transition-all",
        nested && "py-2 pl-11 text-[13px]",
        collapsed && "justify-center px-0",
        isPlatform
          ? active
            ? "bg-white/10 font-semibold text-green-lime border-r-[3px] border-green-lime"
            : "text-white/70 hover:bg-white/5 hover:text-white"
          : active
            ? "sidebar-item-active"
            : "text-slate-600 hover:bg-slate-50",
      )}
    >
      <Icon
        className={cn(
          "size-4 shrink-0",
          !isPlatform && !active && "text-slate-500",
        )}
        aria-hidden
      />
      {!collapsed ? <span className="sidebar-text truncate">{item.label}</span> : null}
    </Link>
  );
}

function ExpandableItem({
  item,
  collapsed,
  variant,
  expanded,
  activeChildId,
  onToggle,
  onNavigate,
}: {
  item: NavItem;
  collapsed?: boolean;
  variant: "tenant" | "platform";
  expanded: boolean;
  activeChildId?: string;
  onToggle: () => void;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const Icon = item.icon;
  const isPlatform = variant === "platform";
  const parentActive =
    isNavItemActive(pathname, item) ||
    Boolean(item.children?.some((child) => isNavItemActive(pathname, child)));

  if (collapsed) {
    return (
      <NavLink
        item={item}
        collapsed
        variant={variant}
        active={parentActive}
        onNavigate={onNavigate}
      />
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-sm transition-all",
          isPlatform
            ? parentActive
              ? "bg-white/10 font-semibold text-white"
              : "text-white/70 hover:bg-white/5 hover:text-white"
            : parentActive
              ? "bg-active-bg font-semibold text-navy"
              : "text-slate-600 hover:bg-slate-50",
        )}
        aria-expanded={expanded}
      >
        <Icon className="size-4 shrink-0" aria-hidden />
        <span className="flex-1 truncate text-left">{item.label}</span>
        <ChevronDownIcon
          className={cn(
            "size-3.5 shrink-0 transition-transform",
            expanded && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {expanded ? (
        <div className="mt-1 space-y-0.5">
          {item.children?.map((child) => (
            <NavLink
              key={child.id}
              item={child}
              variant={variant}
              nested
              active={activeChildId === child.id || isNavItemActive(pathname, child)}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function SidebarNav({
  sections,
  collapsed = false,
  variant = "tenant",
  onNavigate,
}: SidebarNavProps) {
  const pathname = usePathname();
  const isPlatform = variant === "platform";

  const routeExpanded = useMemo(() => {
    const ids = new Set<string>();
    for (const section of sections) {
      const result = findActiveSectionItemIds(pathname, section.items);
      result.expandIds.forEach((id) => ids.add(id));
    }
    return ids;
  }, [pathname, sections]);

  /** Manual overrides layered on route-driven expansion */
  const [manualExpanded, setManualExpanded] = useState<
    Record<string, boolean>
  >({});

  const expandedIds = useMemo(() => {
    const ids = new Set(routeExpanded);
    for (const [id, value] of Object.entries(manualExpanded)) {
      if (value) ids.add(id);
      else ids.delete(id);
    }
    return ids;
  }, [routeExpanded, manualExpanded]);

  return (
    <div className="space-y-6">
      {sections.map((section, index) => {
        const { activeId } = findActiveSectionItemIds(pathname, section.items);

        return (
          <div key={section.id}>
            {index > 0 ? (
              <div
                className={cn(
                  "mb-6 h-px",
                  isPlatform ? "bg-white/5" : "bg-border-slate",
                )}
              />
            ) : null}
            {!collapsed ? (
              <h3
                className={cn(
                  "sidebar-section-title mb-4 ml-4 text-[10px] font-bold tracking-[0.2em] uppercase",
                  isPlatform ? "text-white/30" : "text-slate-400",
                )}
              >
                {section.title}
              </h3>
            ) : null}
            <nav className="space-y-1" aria-label={section.title}>
              {section.items.map((item) =>
                item.children?.length ? (
                  <ExpandableItem
                    key={item.id}
                    item={item}
                    collapsed={collapsed}
                    variant={variant}
                    expanded={expandedIds.has(item.id)}
                    activeChildId={activeId}
                    onToggle={() =>
                      setManualExpanded((prev) => ({
                        ...prev,
                        [item.id]: !expandedIds.has(item.id),
                      }))
                    }
                    onNavigate={onNavigate}
                  />
                ) : (
                  <NavLink
                    key={item.id}
                    item={item}
                    collapsed={collapsed}
                    variant={variant}
                    active={isNavItemActive(pathname, item)}
                    onNavigate={onNavigate}
                  />
                ),
              )}
            </nav>
          </div>
        );
      })}
    </div>
  );
}
