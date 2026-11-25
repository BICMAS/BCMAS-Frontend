"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeftIcon, Loader2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { completePasswordReset, DEMO_MFA, EMAIL_CODE_MINUTES, startPasswordReset } from "@/features/accounts/services/accounts";
import { AuthCard } from "@/features/authentication/components/auth-card";
import { DemoCodeNote } from "@/features/authentication/components/demo-code-note";
import { EmailField } from "@/features/authentication/components/email-field";
import { PasswordField } from "@/features/authentication/components/password-field";
import { PasswordStrength } from "@/features/authentication/components/password-strength";
import { TextField } from "@/features/authentication/components/text-field";
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  type ForgotPasswordInput,
  type ResetPasswordInput,
} from "@/features/authentication/schemas/auth-schemas";

type Sent = { email: string; demoCode: string | null };

/** A code typed on this page, never a link. */
export function ForgotPasswordForm() {
  const [sent, setSent] = useState<Sent | null>(null);
  return (
    <AuthCard>
      <Link href="/login" className="mb-6 inline-flex items-center gap-2 text-xs font-bold tracking-widest text-slate-400 uppercase hover:text-navy">
        <ArrowLeftIcon className="size-2.5" aria-hidden />
        Back to login
      </Link>
      {sent ? <ResetStep sent={sent} onRestart={() => setSent(null)} /> : <EmailStep onSent={setSent} />}
    </AuthCard>
  );
}

function EmailStep({ onSent }: { onSent: (sent: Sent) => void }) {
  const { control, handleSubmit, formState } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });
  const onSubmit = handleSubmit(async ({ email }) => onSent({ email, ...(await startPasswordReset(email)) }));
  return (
    <>
      <h2 className="text-2xl font-bold text-navy">Reset your password</h2>
      <p className="mt-2 mb-8 text-sm leading-relaxed text-slate-500">
        Enter your work email and we&apos;ll send you a 6-digit code. Our emails never contain a link to set a password.
      </p>
      <form onSubmit={onSubmit} className="space-y-6" noValidate>
        <EmailField control={control} name="email" />
        <Button type="submit" className="h-auto w-full py-3 shadow-md shadow-navy/10" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? <Loader2Icon className="size-4 animate-spin" aria-label="Please wait" /> : "Send code"}
        </Button>
      </form>
    </>
  );
}

function ResetStep({ sent, onRestart }: { sent: Sent; onRestart: () => void }) {
  const router = useRouter();
  const { control, handleSubmit, formState, setError } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { emailCode: "", mfaCode: "", password: "", confirmPassword: "" },
    mode: "onTouched",
  });
  const password = useWatch({ control, name: "password" }) ?? "";
  const onSubmit = handleSubmit(async (values) => {
    const result = await completePasswordReset({ email: sent.email, ...values });
    if (!result.ok) return setError("emailCode", { message: result.message });
    toast.success("Password updated. You can sign in with your new password.");
    router.push("/login");
  });
  return (
    <>
      <h2 className="text-2xl font-bold text-navy">Set a new password</h2>
      <p className="mt-2 mb-6 text-sm text-slate-500">
        If an account exists for <strong className="text-navy">{sent.email}</strong>, a code is on its way. It works for {EMAIL_CODE_MINUTES} minutes.
      </p>
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <DemoCodeNote>
          Sample data, no email is sent. {sent.demoCode ? `The emailed code is ${sent.demoCode}. The MFA code is ${DEMO_MFA}.` : "This email has no account that can reset a password."}
        </DemoCodeNote>
        <TextField control={control} name="emailCode" label="Code from your email" inputMode="numeric" autoComplete="one-time-code" maxLength={6} />
        <TextField control={control} name="mfaCode" label="Code from your authenticator app" inputMode="numeric" autoComplete="off" maxLength={6} />
        <div className="space-y-3">
          <PasswordField control={control} name="password" label="New Password" autoComplete="new-password" />
          <PasswordStrength password={password} />
        </div>
        <PasswordField control={control} name="confirmPassword" label="Confirm New Password" autoComplete="new-password" />
        <Button type="submit" className="h-auto w-full py-3 shadow-md shadow-navy/10" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? <Loader2Icon className="size-4 animate-spin" aria-label="Please wait" /> : "Update Password"}
        </Button>
        <p className="text-center text-xs text-slate-500">
          Lost your authenticator app? Ask your administrator to reset your sign-in.{" "}
          <button type="button" className="font-bold text-navy hover:underline" onClick={onRestart}>
            Use a different email
          </button>
        </p>
      </form>
    </>
  );
}
