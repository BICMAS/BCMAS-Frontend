import Link from "next/link";
import { BanIcon } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { AuthCard } from "@/features/authentication/components/auth-card";
import { cn } from "@/lib/utils";

export function AccessDeniedView() {
  return (
    <AuthCard contentClassName="p-10 text-center lg:p-12">
      <div className="mx-auto mb-8 flex size-24 items-center justify-center rounded-full border border-red-100 bg-red-50 text-red-600">
        <BanIcon className="size-10" aria-hidden />
      </div>

      <h1 className="mb-4 text-3xl font-bold tracking-tight text-navy">
        Access Denied
      </h1>
      <p className="mb-8 text-sm leading-relaxed text-slate-500">
        You do not have the required permissions to access this workspace or
        resource. Please contact your organization&apos;s Platform Administrator
        to request access.
      </p>

      <div className="mb-8 rounded-xl border border-border-slate bg-slate-50 p-6 text-left">
        <p className="mb-3 text-[10px] font-bold tracking-widest text-slate-400 uppercase">
          Error Details
        </p>
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">Workspace:</span>
            <span className="font-bold">Global Enterprise Corp</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">User ID:</span>
            <span className="font-mono text-[10px]">usr_8721_jenkins_s</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">Error Code:</span>
            <span className="font-mono text-[10px]">ERR_AUTH_FORBIDDEN_403</span>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <Link
          href="/workspaces"
          className={cn(
            buttonVariants({ variant: "default" }),
            "h-auto w-full py-3 shadow-md shadow-navy/10",
          )}
        >
          Switch Workspace
        </Link>
        <Link
          href="/login"
          className={cn(
            buttonVariants({ variant: "outline" }),
            "h-auto w-full py-3",
          )}
        >
          Sign Out
        </Link>
      </div>

      <p className="mt-8 text-xs text-slate-400">
        If you believe this is an error, please reach out to
        <br />
        <a
          href="mailto:support@bicmas.com"
          className="font-semibold text-navy hover:underline"
        >
          support@bicmas.com
        </a>
      </p>
    </AuthCard>
  );
}
