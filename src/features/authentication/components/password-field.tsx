"use client";

import { useState, type ReactNode } from "react";
import { EyeIcon, EyeOffIcon, LockIcon } from "lucide-react";
import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { Controller } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type PasswordFieldProps<T extends FieldValues> = {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  placeholder?: string;
  autoComplete?: string;
  className?: string;
  showLeadingIcon?: boolean;
  labelAction?: ReactNode;
};

/**
 * Password input with show/hide toggle and RHF Controller wiring.
 */
export function PasswordField<T extends FieldValues>({
  control,
  name,
  label,
  placeholder = "••••••••",
  autoComplete = "current-password",
  className,
  showLeadingIcon = true,
  labelAction,
}: PasswordFieldProps<T>) {
  const [visible, setVisible] = useState(false);

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <div data-slot="field" className={cn("space-y-2", className)}>
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor={field.name}>{label}</Label>
            {labelAction}
          </div>
          <div className="relative">
            {showLeadingIcon ? (
              <LockIcon
                className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-slate-400"
                aria-hidden
              />
            ) : null}
            <Input
              {...field}
              id={field.name}
              type={visible ? "text" : "password"}
              placeholder={placeholder}
              autoComplete={autoComplete}
              aria-invalid={fieldState.invalid || undefined}
              className={cn(showLeadingIcon && "pl-11", "pr-12")}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute top-1/2 right-2 -translate-y-1/2 text-slate-400 hover:text-navy"
              onClick={() => setVisible((v) => !v)}
              aria-label={visible ? "Hide password" : "Show password"}
            >
              {visible ? (
                <EyeOffIcon className="size-3.5" />
              ) : (
                <EyeIcon className="size-3.5" />
              )}
            </Button>
          </div>
          {fieldState.error?.message ? (
            <p className="text-xs font-medium text-error-soft-foreground">
              {fieldState.error.message}
            </p>
          ) : null}
        </div>
      )}
    />
  );
}
