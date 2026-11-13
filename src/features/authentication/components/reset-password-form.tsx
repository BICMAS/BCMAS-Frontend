"use client";

import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRoundIcon, Loader2Icon } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { AuthCard } from "@/features/authentication/components/auth-card";
import { PasswordField } from "@/features/authentication/components/password-field";
import { PasswordStrength } from "@/features/authentication/components/password-strength";
import {
  resetPasswordSchema,
  type ResetPasswordInput,
} from "@/features/authentication/schemas/auth-schemas";
import { mockResetPassword } from "@/features/authentication/services/mock-auth";

export function ResetPasswordForm() {
  const router = useRouter();

  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
    mode: "onChange",
  });

  const { control, handleSubmit, formState } = form;
  const password = useWatch({ control, name: "password" }) ?? "";
  const submitting = formState.isSubmitting;

  const onSubmit = handleSubmit(async () => {
    const result = await mockResetPassword();
    if (result.status === "error") {
      toast.error(result.message);
      return;
    }
    toast.success(result.message ?? "Password updated");
    router.push(result.redirectTo);
  });

  return (
    <AuthCard>
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-navy">
          <KeyRoundIcon className="size-5 text-green-lime" aria-hidden />
        </div>
        <h2 className="text-2xl font-bold text-navy">Set new password</h2>
        <p className="mt-2 text-sm text-slate-500">
          Create a secure password for your BCMS account.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-6" noValidate>
        <div className="space-y-3">
          <PasswordField
            control={control}
            name="password"
            label="New Password"
            autoComplete="new-password"
          />
          <PasswordStrength password={password} />
        </div>

        <PasswordField
          control={control}
          name="confirmPassword"
          label="Confirm New Password"
          autoComplete="new-password"
        />

        <Button
          type="submit"
          className="h-auto w-full py-3 shadow-md shadow-navy/10"
          disabled={submitting}
        >
          {submitting ? (
            <>
              <Loader2Icon className="size-4 animate-spin" />
              Updating…
            </>
          ) : (
            "Update Password"
          )}
        </Button>
      </form>
    </AuthCard>
  );
}
