"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { AuthBrandHeader } from "@/features/authentication/components/auth-brand-header";
import { AuthCard } from "@/features/authentication/components/auth-card";
import { EmailField } from "@/features/authentication/components/email-field";
import { MicrosoftSsoButton } from "@/features/authentication/components/microsoft-sso-button";
import { PasswordField } from "@/features/authentication/components/password-field";
import {
  loginSchema,
  type LoginInput,
} from "@/features/authentication/schemas/auth-schemas";
import {
  DEMO_AUTH_HINT,
  mockMicrosoftSignIn,
  mockSignIn,
} from "@/features/authentication/services/mock-auth";

export function LoginForm() {
  const router = useRouter();
  const [ssoLoading, setSsoLoading] = useState(false);

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
      remember: false,
    },
  });

  const { control, handleSubmit, formState } = form;
  const submitting = formState.isSubmitting;

  const onSubmit = handleSubmit(async (values) => {
    const result = await mockSignIn(values);

    if (result.status === "locked") {
      toast.error(result.message);
      router.push(result.redirectTo);
      return;
    }

    if (result.status === "error") {
      toast.error(result.message);
      return;
    }

    toast.success(result.message ?? "Continue with MFA");
    router.push(result.redirectTo);
  });

  const onMicrosoft = async () => {
    setSsoLoading(true);
    try {
      const result = await mockMicrosoftSignIn();
      if (result.status === "error") {
        toast.error(result.message);
        return;
      }
      toast.success(result.message ?? "SSO success");
      router.push(result.redirectTo);
    } finally {
      setSsoLoading(false);
    }
  };

  return (
    <AuthCard
      className="overflow-hidden p-0"
      contentClassName="p-0"
      footer={
        <p className="text-xs text-slate-400">
          By signing in, you agree to our{" "}
          <a href="#" className="text-slate-600 underline hover:text-navy">
            Terms of Service
          </a>{" "}
          and{" "}
          <a href="#" className="text-slate-600 underline hover:text-navy">
            Privacy Policy
          </a>
          .
        </p>
      }
    >
      <AuthBrandHeader />
      <div className="p-8 lg:p-10">
        <div className="mb-8">
          <h2 className="text-xl font-bold text-navy">Welcome back</h2>
          <p className="mt-1 text-sm text-slate-500">
            Sign in to manage your organisational capability.
          </p>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
            {DEMO_AUTH_HINT}
          </p>
        </div>

        <MicrosoftSsoButton
          loading={ssoLoading}
          disabled={submitting}
          onClick={onMicrosoft}
        />

        <div className="relative mb-6 flex items-center">
          <div className="flex-grow border-t border-border-slate" />
          <span className="mx-4 flex-shrink text-[10px] font-bold tracking-widest text-slate-400 uppercase">
            or continue with email
          </span>
          <div className="flex-grow border-t border-border-slate" />
        </div>

        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          <EmailField control={control} name="email" />

          <PasswordField
            control={control}
            name="password"
            label="Password"
            labelAction={
              <Link
                href="/forgot-password"
                className="text-xs font-bold text-green-deep hover:underline"
              >
                Forgot?
              </Link>
            }
          />

          <Controller
            control={control}
            name="remember"
            render={({ field }) => (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="remember"
                  checked={field.value}
                  onCheckedChange={(checked) =>
                    field.onChange(checked === true)
                  }
                />
                <Label
                  htmlFor="remember"
                  className="text-sm font-normal tracking-normal text-slate-600 normal-case"
                >
                  Keep me signed in
                </Label>
              </div>
            )}
          />

          <Button
            type="submit"
            className="mt-2 h-auto w-full py-3 shadow-md shadow-navy/10"
            disabled={submitting || ssoLoading}
          >
            {submitting ? (
              <>
                <Loader2Icon className="size-4 animate-spin" />
                Signing in…
              </>
            ) : (
              "Sign In"
            )}
          </Button>
        </form>
      </div>
    </AuthCard>
  );
}
