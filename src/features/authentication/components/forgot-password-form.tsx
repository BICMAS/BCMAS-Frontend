"use client";

import Link from "next/link";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeftIcon, Loader2Icon, SendIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { AuthCard } from "@/features/authentication/components/auth-card";
import { EmailField } from "@/features/authentication/components/email-field";
import {
  forgotPasswordSchema,
  type ForgotPasswordInput,
} from "@/features/authentication/schemas/auth-schemas";
import { mockForgotPassword } from "@/features/authentication/services/mock-auth";
import { cn } from "@/lib/utils";

export function ForgotPasswordForm() {
  const [sentTo, setSentTo] = useState<string | null>(null);

  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const { control, handleSubmit, formState, reset } = form;
  const submitting = formState.isSubmitting;

  const onSubmit = handleSubmit(async (values) => {
    const result = await mockForgotPassword(values.email);
    toast.success(result.message ?? "Check your inbox");
    setSentTo(values.email);
  });

  return (
    <AuthCard>
      {sentTo ? (
        <div className="py-4 text-center">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-green-lime/10 text-green-deep">
            <SendIcon className="size-7" aria-hidden />
          </div>
          <h3 className="mb-2 text-xl font-bold text-navy">Check your inbox</h3>
          <p className="mb-6 text-sm leading-relaxed text-slate-500">
            If an account exists for{" "}
            <span className="font-bold text-navy">{sentTo}</span>, you will
            receive a reset link shortly.
          </p>
          <div className="flex flex-col items-center gap-3">
            <Button
              type="button"
              variant="link"
              className="h-auto p-0 text-sm font-bold text-navy"
              onClick={() => {
                setSentTo(null);
                reset({ email: sentTo });
              }}
            >
              Didn&apos;t get the email? Try again
            </Button>
            <Link
              href="/reset-password"
              className={cn(
                buttonVariants({ variant: "secondary" }),
                "w-full",
              )}
            >
              Open demo reset link
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-navy"
            >
              <ArrowLeftIcon className="size-3" aria-hidden />
              Back to login
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-8">
            <Link
              href="/login"
              className="mb-6 inline-flex items-center gap-2 text-xs font-bold tracking-widest text-slate-400 uppercase transition-colors hover:text-navy"
            >
              <ArrowLeftIcon className="size-2.5" aria-hidden />
              Back to login
            </Link>
            <h2 className="text-2xl font-bold text-navy">Reset your password</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              Enter the work email associated with your account and we&apos;ll
              send you instructions to reset your password.
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-6" noValidate>
            <EmailField control={control} name="email" />
            <Button
              type="submit"
              className="h-auto w-full py-3 shadow-md shadow-navy/10"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2Icon className="size-4 animate-spin" />
                  Sending…
                </>
              ) : (
                "Send Reset Instructions"
              )}
            </Button>
          </form>
        </>
      )}
    </AuthCard>
  );
}
