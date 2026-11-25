"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon, UserPlusIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { completeActivation, EMAIL_CODE_MINUTES, startActivation } from "@/features/accounts/services/accounts";
import { AuthCard } from "@/features/authentication/components/auth-card";
import { DemoCodeNote } from "@/features/authentication/components/demo-code-note";
import { EmailField } from "@/features/authentication/components/email-field";
import { PasswordField } from "@/features/authentication/components/password-field";
import { PasswordStrength } from "@/features/authentication/components/password-strength";
import { TextField } from "@/features/authentication/components/text-field";
import {
  activateAccountSchema,
  activationCodeSchema,
  type ActivateAccountInput,
  type ActivationCodeInput,
} from "@/features/authentication/schemas/auth-schemas";

type Started = { email: string; code: string; name: string; organisation: string; demoCode: string };

/** Activation code from the admin, then the emailed code and the person's own password. */
export function ActivateAccountForm() {
  const [started, setStarted] = useState<Started | null>(null);
  return (
    <AuthCard className="overflow-hidden p-0" contentClassName="p-0">
      <div className="flex items-center gap-3 bg-navy px-8 py-6">
        <div className="flex size-8 items-center justify-center rounded bg-green-lime">
          <UserPlusIcon className="size-3.5 text-navy" aria-hidden />
        </div>
        <h1 className="text-lg font-bold tracking-tight text-white">Activate Account</h1>
      </div>
      <div className="p-8 lg:p-10">
        {started ? <PasswordStep started={started} onRestart={() => setStarted(null)} /> : <CodeStep onStarted={setStarted} />}
        <p className="mt-6 text-center text-xs">
          <Link href="/login" className="font-bold text-slate-400 hover:text-navy">
            Back to login
          </Link>
        </p>
      </div>
    </AuthCard>
  );
}

function CodeStep({ onStarted }: { onStarted: (started: Started) => void }) {
  const { control, handleSubmit, formState, setError, setValue } = useForm<ActivationCodeInput>({
    resolver: zodResolver(activationCodeSchema),
    defaultValues: { email: "", code: "" },
  });

  useEffect(() => {
    // From an email link, for organisations that allow them. Removed from the address bar at once.
    const link = new URLSearchParams(window.location.hash.slice(1));
    if (!link.has("code")) return;
    setValue("email", link.get("email") ?? "");
    setValue("code", link.get("code") ?? "");
    window.history.replaceState(null, "", window.location.pathname);
  }, [setValue]);

  const onSubmit = handleSubmit(async (values) => {
    const result = await startActivation(values.email, values.code);
    if (!result.ok) return setError("code", { message: result.message });
    onStarted({ ...values, name: result.name, organisation: result.organisation, demoCode: result.demoCode });
  });

  return (
    <>
      <h2 className="text-xl font-bold text-navy">Enter your activation code</h2>
      <p className="mt-1 mb-8 text-sm text-slate-500">Your administrator gives you this code. BICMAS never asks for it by email or phone.</p>
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <EmailField control={control} name="email" />
        <TextField control={control} name="code" label="Activation code" placeholder="XXXX-XXXX-XXXX" autoComplete="off" maxLength={20} className="font-mono uppercase" />
        <Submit pending={formState.isSubmitting}>Continue</Submit>
      </form>
    </>
  );
}

function PasswordStep({ started, onRestart }: { started: Started; onRestart: () => void }) {
  const router = useRouter();
  const { control, handleSubmit, formState, setError } = useForm<ActivateAccountInput>({
    resolver: zodResolver(activateAccountSchema),
    defaultValues: { emailCode: "", password: "", confirmPassword: "" },
    mode: "onTouched",
  });
  const password = useWatch({ control, name: "password" }) ?? "";

  const onSubmit = handleSubmit(async (values) => {
    const result = await completeActivation({ email: started.email, code: started.code, emailCode: values.emailCode, password: values.password });
    if (!result.ok) return setError("emailCode", { message: result.message });
    toast.success("Account activated. Confirm it's you to continue.");
    router.push("/mfa");
  });

  return (
    <>
      <h2 className="text-xl font-bold text-navy">Welcome, {started.name}</h2>
      <p className="mt-1 mb-6 text-sm text-slate-500">
        Set up your account for {started.organisation}. We sent a 6-digit code to {started.email}; it works for {EMAIL_CODE_MINUTES} minutes.
      </p>
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <DemoCodeNote>Sample data, no email is sent. The emailed code is {started.demoCode}.</DemoCodeNote>
        <TextField control={control} name="emailCode" label="Code from your email" inputMode="numeric" autoComplete="one-time-code" maxLength={6} />
        <div className="space-y-3">
          <PasswordField control={control} name="password" label="Set Password" autoComplete="new-password" />
          <PasswordStrength password={password} />
        </div>
        <PasswordField control={control} name="confirmPassword" label="Confirm Password" autoComplete="new-password" />
        <Submit pending={formState.isSubmitting}>Complete Activation</Submit>
        <Button type="button" variant="link" className="h-auto w-full p-0 text-xs" onClick={onRestart}>
          Start again
        </Button>
      </form>
    </>
  );
}

function Submit({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <Button type="submit" className="h-auto w-full py-3 shadow-md shadow-navy/10" disabled={pending}>
      {pending ? <Loader2Icon className="size-4 animate-spin" aria-label="Please wait" /> : children}
    </Button>
  );
}
