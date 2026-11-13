import Link from "next/link";
import { InfoIcon, UserLockIcon } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { AuthCard } from "@/features/authentication/components/auth-card";
import { cn } from "@/lib/utils";

export function AccountLockedView() {
  return (
    <AuthCard contentClassName="p-10 text-center lg:p-12">
      <div className="mx-auto mb-8 flex size-24 items-center justify-center rounded-full border border-amber-100 bg-amber-50 text-amber-600">
        <UserLockIcon className="size-10" aria-hidden />
      </div>

      <h1 className="mb-4 text-3xl font-bold tracking-tight text-navy">
        Account Locked
      </h1>
      <p className="mb-8 text-sm leading-relaxed text-slate-500">
        For your security, your account has been temporarily locked due to
        multiple unsuccessful sign-in attempts. To regain access, you must
        verify your identity.
      </p>

      <div className="mb-8 flex items-start gap-4 rounded-xl border border-amber-100 bg-amber-50 p-4 text-left">
        <InfoIcon className="mt-1 size-4 shrink-0 text-amber-600" aria-hidden />
        <div>
          <p className="mb-1 text-xs font-bold tracking-wider text-amber-800 uppercase">
            Security Policy
          </p>
          <p className="text-[11px] leading-relaxed text-amber-700">
            Accounts are locked for 30 minutes after 5 failed attempts. You can
            unlock it immediately by resetting your password.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <Link
          href="/forgot-password"
          className={cn(
            buttonVariants({ variant: "default" }),
            "h-auto w-full py-3 shadow-md shadow-navy/10",
          )}
        >
          Unlock with Password Reset
        </Link>
        <Link
          href="/login"
          className={cn(
            buttonVariants({ variant: "outline" }),
            "h-auto w-full py-3",
          )}
        >
          Back to Login
        </Link>
      </div>

      <p className="mt-8 text-xs text-slate-400">
        Need urgent assistance?
        <br />
        <a
          href="mailto:security@bicmas.com"
          className="font-semibold text-navy hover:underline"
        >
          security@bicmas.com
        </a>
      </p>
    </AuthCard>
  );
}
