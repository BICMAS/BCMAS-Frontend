"use client";

import { Building2Icon, CheckIcon, ChevronDownIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSessionStore } from "@/stores/session-store";
import { cn } from "@/lib/utils";

type TenantSwitcherProps = {
  className?: string;
  compact?: boolean;
};

export function TenantSwitcher({ className, compact = false }: TenantSwitcherProps) {
  const organisation = useSessionStore((s) => s.organisation);
  const organisations = useSessionStore((s) => s.organisations);
  const setOrganisationId = useSessionStore((s) => s.setOrganisationId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            className={cn(
              "h-auto gap-2 border border-border-slate bg-slate-50 px-3 py-1.5 font-semibold text-slate-600 hover:bg-slate-100 hover:text-navy",
              compact && "w-full justify-between",
              className,
            )}
          />
        }
      >
        <Building2Icon className="size-3.5 text-slate-400" aria-hidden />
        <span className="max-w-[160px] truncate text-xs">
          {organisation.name}
        </span>
        <ChevronDownIcon className="size-2.5 text-slate-400" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56">
        <DropdownMenuLabel>Workspace</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {organisations.map((org) => (
          <DropdownMenuItem
            key={org.id}
            onClick={() => {
              setOrganisationId(org.id);
              toast.success(`Switched to ${org.name}`);
            }}
            className="justify-between"
          >
            <span>{org.name}</span>
            {org.id === organisation.id ? (
              <CheckIcon className="size-4 text-green-deep" aria-hidden />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
