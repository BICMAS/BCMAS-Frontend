"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowRightIcon,
  LayersIcon,
  Loader2Icon,
  PlusIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  mockSelectWorkspace,
  mockWorkspaces,
} from "@/features/authentication/services/mock-auth";
import { cn } from "@/lib/utils";

export function WorkspaceSelectionView() {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const onSelect = async (workspaceId: string) => {
    setLoadingId(workspaceId);
    try {
      const result = await mockSelectWorkspace(workspaceId);
      if (result.status === "error") {
        toast.error(result.message);
        router.push("/access-denied");
        return;
      }
      toast.success(result.message ?? "Workspace selected");
      router.push(result.redirectTo);
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="w-full max-w-2xl">
      <div className="mb-10 text-center">
        <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl bg-navy shadow-lg shadow-navy/20">
          <LayersIcon className="size-7 text-green-lime" aria-hidden />
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-navy">
          Select your workspace
        </h1>
        <p className="mt-2 text-slate-500">
          You are a member of multiple organizations. Please select one to
          continue.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {mockWorkspaces.map((workspace) => {
          const busy = loadingId === workspace.id;
          return (
            <button
              key={workspace.id}
              type="button"
              disabled={loadingId !== null}
              onClick={() => onSelect(workspace.id)}
              className={cn(
                "group relative overflow-hidden rounded-2xl border border-border-slate bg-white p-6 text-left shadow-sm transition-all",
                "hover:border-green-lime hover:shadow-xl hover:shadow-navy/5",
                "disabled:cursor-wait disabled:opacity-70",
              )}
            >
              {workspace.active ? (
                <div className="absolute top-0 right-0 p-3">
                  <Badge className="rounded bg-green-lime/10 text-[10px] font-bold tracking-wider text-green-deep uppercase">
                    Active
                  </Badge>
                </div>
              ) : null}

              <div className="mb-4 flex items-center gap-4">
                <div className="flex size-14 items-center justify-center rounded-xl border border-border-slate bg-slate-50 text-xl font-bold text-navy transition-colors group-hover:bg-navy group-hover:text-white">
                  {busy ? (
                    <Loader2Icon className="size-5 animate-spin" />
                  ) : (
                    workspace.initials
                  )}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-navy">
                    {workspace.name}
                  </h3>
                  <p className="text-xs text-slate-500">{workspace.role}</p>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-between text-sm">
                <span className="font-medium text-slate-400">
                  {workspace.meta}
                </span>
                <ArrowRightIcon
                  className="size-4 text-slate-300 transition-all group-hover:translate-x-1 group-hover:text-green-lime"
                  aria-hidden
                />
              </div>
            </button>
          );
        })}

        <Button
          type="button"
          variant="ghost"
          className="group h-auto justify-start rounded-2xl border-2 border-dashed border-border-slate bg-slate-50 p-6 text-left hover:border-green-lime hover:bg-white"
          onClick={() =>
            toast.message("Join with invitation code", {
              description: "Open an invite link or enter a code when available.",
              action: {
                label: "View invite",
                onClick: () => router.push("/invite"),
              },
            })
          }
        >
          <div className="flex items-center gap-4">
            <div className="flex size-14 items-center justify-center rounded-xl border border-border-slate bg-white text-slate-300 transition-colors group-hover:text-green-lime">
              <PlusIcon className="size-7" aria-hidden />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-400 group-hover:text-navy">
                Join New Workspace
              </h3>
              <p className="text-xs text-slate-400">Enter an invitation code</p>
            </div>
          </div>
        </Button>
      </div>

      <div className="mt-12 text-center">
        <Link
          href="/login"
          className="text-sm font-bold text-slate-500 transition-colors hover:text-navy"
        >
          Sign out and switch accounts
        </Link>
      </div>
    </div>
  );
}
