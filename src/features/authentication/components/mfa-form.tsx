"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeftIcon, Loader2Icon, ShieldHalfIcon } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { AuthCard } from "@/features/authentication/components/auth-card";
import { OtpInputs } from "@/features/authentication/components/otp-inputs";
import {
  mfaSchema,
  type MfaInput,
} from "@/features/authentication/schemas/auth-schemas";
import {
  mockResendMfaCode,
  mockVerifyMfa,
} from "@/features/authentication/services/mock-auth";

export function MfaForm() {
  const router = useRouter();
  const [resending, setResending] = useState(false);

  const form = useForm<MfaInput>({
    resolver: zodResolver(mfaSchema),
    defaultValues: { code: "" },
  });

  const { control, handleSubmit, formState, setError } = form;
  const submitting = formState.isSubmitting;

  const onSubmit = handleSubmit(async (values) => {
    const result = await mockVerifyMfa(values.code);
    if (result.status === "error") {
      toast.error(result.message);
      setError("code", { message: result.message });
      return;
    }
    toast.success(result.message ?? "Verified");
    router.push(result.redirectTo);
  });

  const onResend = async () => {
    setResending(true);
    try {
      const result = await mockResendMfaCode();
      toast.success(result.message ?? "Code resent");
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthCard
      footer={
        <Link
          href="/login"
          className="inline-flex items-center justify-center gap-2 text-xs font-bold text-slate-400 hover:text-navy"
        >
          <ArrowLeftIcon className="size-3" aria-hidden />
          Back to login
        </Link>
      }
    >
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full border border-blue-100 bg-blue-50 text-navy">
          <ShieldHalfIcon className="size-7" aria-hidden />
        </div>
        <h2 className="text-2xl font-bold text-navy">
          Two-factor authentication
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          Enter the 6-digit code from your authenticator app to secure your
          sign-in.
        </p>
        <p className="mt-2 text-[11px] text-slate-400">Demo code: 123456</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-8" noValidate>
        <Controller
          control={control}
          name="code"
          render={({ field, fieldState }) => (
            <div className="space-y-2">
              <OtpInputs
                value={field.value}
                onChange={field.onChange}
                disabled={submitting}
                error={fieldState.invalid}
              />
              {fieldState.error?.message ? (
                <p className="text-center text-xs font-medium text-error-soft-foreground">
                  {fieldState.error.message}
                </p>
              ) : null}
            </div>
          )}
        />

        <div className="space-y-4">
          <Button
            type="submit"
            className="h-auto w-full py-3 shadow-md shadow-navy/10"
            disabled={submitting}
          >
            {submitting ? (
              <>
                <Loader2Icon className="size-4 animate-spin" />
                Verifying…
              </>
            ) : (
              "Verify & Continue"
            )}
          </Button>

          <div className="flex flex-col gap-3 text-center">
            <Button
              type="button"
              variant="link"
              className="h-auto p-0 text-xs font-bold text-green-deep"
              disabled={resending || submitting}
              onClick={onResend}
            >
              {resending ? "Sending…" : "Resend code"}
            </Button>
            <Button
              type="button"
              variant="link"
              className="h-auto p-0 text-xs font-bold text-slate-400 hover:text-navy"
              onClick={() =>
                toast.message("Use a backup recovery code", {
                  description:
                    "Backup codes will be available when MFA is connected to a real provider.",
                })
              }
            >
              Use a backup recovery code
            </Button>
          </div>
        </div>
      </form>
    </AuthCard>
  );
}
