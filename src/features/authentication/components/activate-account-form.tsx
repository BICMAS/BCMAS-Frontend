"use client";

import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon, UserPlusIcon } from "lucide-react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { Field } from "@/components/shared/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthCard } from "@/features/authentication/components/auth-card";
import { PasswordField } from "@/features/authentication/components/password-field";
import { PasswordStrength } from "@/features/authentication/components/password-strength";
import {
  activateAccountSchema,
  type ActivateAccountInput,
} from "@/features/authentication/schemas/auth-schemas";
import { mockActivateAccount } from "@/features/authentication/services/mock-auth";

export function ActivateAccountForm() {
  const router = useRouter();

  const form = useForm<ActivateAccountInput>({
    resolver: zodResolver(activateAccountSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      jobTitle: "",
      password: "",
      confirmPassword: "",
    },
    mode: "onTouched",
  });

  const { control, handleSubmit, formState } = form;
  const password = useWatch({ control, name: "password" }) ?? "";
  const submitting = formState.isSubmitting;

  const onSubmit = handleSubmit(async () => {
    const result = await mockActivateAccount();
    if (result.status === "error") {
      toast.error(result.message);
      return;
    }
    toast.success(result.message ?? "Account activated");
    router.push(result.redirectTo);
  });

  return (
    <AuthCard className="overflow-hidden p-0" contentClassName="p-0">
      <div className="flex items-center gap-3 bg-navy px-8 py-6">
        <div className="flex size-8 items-center justify-center rounded bg-green-lime">
          <UserPlusIcon className="size-3.5 text-navy" aria-hidden />
        </div>
        <h1 className="text-lg font-bold tracking-tight text-white">
          Activate Account
        </h1>
      </div>

      <div className="p-8 lg:p-10">
        <div className="mb-8">
          <h2 className="text-xl font-bold text-navy">Complete your profile</h2>
          <p className="mt-1 text-sm text-slate-500">
            Please provide the remaining details to set up your account for
            Global Enterprise Corp.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Controller
              control={control}
              name="firstName"
              render={({ field, fieldState }) => (
                <Field
                  label="First Name"
                  htmlFor={field.name}
                  error={fieldState.error?.message}
                >
                  <Input
                    {...field}
                    id={field.name}
                    placeholder="John"
                    autoComplete="given-name"
                    aria-invalid={fieldState.invalid || undefined}
                  />
                </Field>
              )}
            />
            <Controller
              control={control}
              name="lastName"
              render={({ field, fieldState }) => (
                <Field
                  label="Last Name"
                  htmlFor={field.name}
                  error={fieldState.error?.message}
                >
                  <Input
                    {...field}
                    id={field.name}
                    placeholder="Doe"
                    autoComplete="family-name"
                    aria-invalid={fieldState.invalid || undefined}
                  />
                </Field>
              )}
            />
          </div>

          <Controller
            control={control}
            name="jobTitle"
            render={({ field, fieldState }) => (
              <Field
                label="Job Title"
                htmlFor={field.name}
                error={fieldState.error?.message}
              >
                <Input
                  {...field}
                  id={field.name}
                  placeholder="Senior Product Designer"
                  autoComplete="organization-title"
                  aria-invalid={fieldState.invalid || undefined}
                />
              </Field>
            )}
          />

          <div className="space-y-3">
            <PasswordField
              control={control}
              name="password"
              label="Set Password"
              autoComplete="new-password"
            />
            <PasswordStrength password={password} />
          </div>

          <PasswordField
            control={control}
            name="confirmPassword"
            label="Confirm Password"
            autoComplete="new-password"
          />

          <div className="pt-4">
            <Button
              type="submit"
              className="h-auto w-full py-3 shadow-md shadow-navy/10"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2Icon className="size-4 animate-spin" />
                  Activating…
                </>
              ) : (
                "Complete Activation"
              )}
            </Button>
          </div>
        </form>
      </div>
    </AuthCard>
  );
}
