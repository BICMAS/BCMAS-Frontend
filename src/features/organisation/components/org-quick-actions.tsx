import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";

const actions = [
  { href: "/org/chart", label: "Visual Org Chart" },
  { href: "/org/departments", label: "Manage Departments" },
  { href: "/roles", label: "Roles Directory" },
] as const;

export function OrgQuickActions() {
  return (
    <div className="rounded-xl bg-navy p-8 text-white">
      <h3 className="mb-2 text-lg font-bold">Quick Actions</h3>
      <p className="mb-6 text-xs leading-relaxed text-white/60">
        Manage your organisational hierarchy and role standards from here.
      </p>
      <div className="space-y-3">
        {actions.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className="flex items-center justify-between rounded-lg bg-white/10 p-3 text-sm font-medium transition-all hover:bg-white/20"
          >
            <span>{action.label}</span>
            <ChevronRightIcon className="size-2.5" aria-hidden />
          </Link>
        ))}
      </div>
    </div>
  );
}
