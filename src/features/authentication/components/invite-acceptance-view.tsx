"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  CheckIcon,
  Loader2Icon,
  MailOpenIcon,
  ShieldUserIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { AuthCard } from "@/features/authentication/components/auth-card";
import {
  mockAcceptInvite,
  mockDeclineInvite,
} from "@/features/authentication/services/mock-auth";

const benefits = [
  "Define Role Standards",
  "Verify Skill Profiles",
  "Access AI Coaching",
] as const;

export function InviteAcceptanceView() {
  const router = useRouter();
  const [pending, setPending] = useState<"accept" | "decline" | null>(null);

  const onAccept = async () => {
    setPending("accept");
    try {
      const result = await mockAcceptInvite();
      if (result.status === "error") {
        toast.error(result.message);
        return;
      }
      toast.success(result.message ?? "Invitation accepted");
      router.push(result.redirectTo);
    } finally {
      setPending(null);
    }
  };

  const onDecline = async () => {
    setPending("decline");
    try {
      const result = await mockDeclineInvite();
      if (result.status === "error") {
        toast.error(result.message);
        return;
      }
      toast.message(result.message ?? "Invitation declined");
      router.push(result.redirectTo);
    } finally {
      setPending(null);
    }
  };

  return (
    <AuthCard
      size="lg"
      className="flex flex-col overflow-hidden p-0 md:flex-row"
      contentClassName="flex flex-col p-0 md:flex-row"
    >
      <div className="flex flex-col justify-between bg-navy p-10 text-white md:w-5/12">
        <div>
          <div className="mb-6 flex size-10 items-center justify-center rounded-lg bg-green-lime">
            <MailOpenIcon className="size-5 text-navy" aria-hidden />
          </div>
          <h2 className="text-3xl leading-tight font-bold">
            Join your organization.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-white/60">
            Collaborate on role requirements, assess capabilities, and drive
            professional growth within your team.
          </p>
        </div>

        <div className="mt-12 space-y-6">
          {benefits.map((item) => (
            <div key={item} className="flex items-center gap-4">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/10">
                <CheckIcon className="size-3 text-green-lime" aria-hidden />
              </div>
              <span className="text-xs font-medium">{item}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="p-10 md:w-7/12">
        <div className="mb-10">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center overflow-hidden rounded-full border border-border-slate bg-slate-50 font-bold text-navy">
              GE
            </div>
            <div>
              <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
                Organization Invitation
              </p>
              <p className="text-sm font-bold text-navy">
                Global Enterprise Corp
              </p>
            </div>
          </div>
          <h3 className="text-xl font-bold text-navy">
            You&apos;ve been invited!
          </h3>
          <p className="mt-2 text-sm text-slate-500">
            Sarah Jenkins has invited you to join the Global Enterprise Corp
            workspace on BICMAS.
          </p>
        </div>

        <div className="mb-8 rounded-xl border border-border-slate bg-slate-50 p-4">
          <p className="mb-2 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
            Assigned Permissions
          </p>
          <div className="flex items-center gap-3 text-sm font-semibold text-navy">
            <ShieldUserIcon className="size-4 text-green-deep" aria-hidden />
            <span>Department Manager</span>
          </div>
        </div>

        <div className="space-y-4">
          <Button
            type="button"
            className="h-auto w-full py-3 shadow-md shadow-navy/10"
            disabled={pending !== null}
            onClick={onAccept}
          >
            {pending === "accept" ? (
              <>
                <Loader2Icon className="size-4 animate-spin" />
                Accepting…
              </>
            ) : (
              "Accept Invitation"
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-auto w-full py-3 text-slate-500"
            disabled={pending !== null}
            onClick={onDecline}
          >
            {pending === "decline" ? (
              <>
                <Loader2Icon className="size-4 animate-spin" />
                Declining…
              </>
            ) : (
              "Decline"
            )}
          </Button>
        </div>

        <p className="mt-8 text-center text-[10px] text-slate-400">
          By accepting, you agree to join the specified organization and share
          your capability data with authorized administrators.
        </p>
      </div>
    </AuthCard>
  );
}
