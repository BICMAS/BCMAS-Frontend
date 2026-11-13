"use client";

import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { Controller } from "react-hook-form";

import { Field } from "@/components/shared/field";
import { Input } from "@/components/ui/input";

type DateFieldProps<T extends FieldValues> = {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  hint?: string;
  className?: string;
};

/**
 * Native date input wired for React Hook Form + Zod schemas.
 */
export function DateField<T extends FieldValues>({
  control,
  name,
  label,
  hint,
  className,
}: DateFieldProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field
          label={label}
          htmlFor={field.name}
          hint={hint}
          error={fieldState.error?.message}
          className={className}
        >
          <Input
            {...field}
            id={field.name}
            type="date"
            value={field.value ?? ""}
            aria-invalid={fieldState.invalid || undefined}
          />
        </Field>
      )}
    />
  );
}
