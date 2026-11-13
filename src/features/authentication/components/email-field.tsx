"use client";

import { MailIcon } from "lucide-react";
import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { Controller } from "react-hook-form";

import { Field } from "@/components/shared/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type EmailFieldProps<T extends FieldValues> = {
  control: Control<T>;
  name: FieldPath<T>;
  label?: string;
  placeholder?: string;
  className?: string;
};

/**
 * Work-email input with leading mail icon.
 */
export function EmailField<T extends FieldValues>({
  control,
  name,
  label = "Work Email",
  placeholder = "name@company.com",
  className,
}: EmailFieldProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field
          label={label}
          htmlFor={field.name}
          error={fieldState.error?.message}
          className={className}
        >
          <div className="relative">
            <MailIcon
              className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <Input
              {...field}
              id={field.name}
              type="email"
              placeholder={placeholder}
              autoComplete="email"
              aria-invalid={fieldState.invalid || undefined}
              className={cn("pl-11")}
            />
          </div>
        </Field>
      )}
    />
  );
}
