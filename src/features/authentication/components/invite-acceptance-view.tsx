"use client";

import { MailOpenIcon } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { AuthCard } from "@/features/authentication/components/auth-card";

/**
 * Where an email link lands, for organisations that allow links. Nothing is used up until the person
 * continues, so an email scanner that opens the link does no harm.
 */
export function InviteAcceptanceView() {
  const router = useRouter();
  return (
    <AuthCard contentClassName="text-center">
      <div className="mx-auto mb-6 flex size-12 items-center justify-center rounded-xl bg-navy">
        <MailOpenIcon className="size-5 text-green-lime" aria-hidden />
      </div>
      <h1 className="text-2xl font-bold text-navy">Your BICMAS account is ready</h1>
      <p className="mt-2 mb-8 text-sm text-slate-500">
        Continue only if you expected this invitation. Next, we confirm your email and you choose a password.
      </p>
      <Button type="button" className="h-auto w-full py-3" onClick={() => router.push(`/activate${window.location.hash}`)}>
        Continue
      </Button>
    </AuthCard>
  );
}
