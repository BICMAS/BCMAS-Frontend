"use client";

import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";

import { Field } from "@/components/shared/field";
import { Input } from "@/components/ui/input";

export function TextField<T extends FieldValues>({
  control,
  name,
  label,
  hint,
  ...input
}: { control: Control<T>; name: FieldPath<T>; label: string; hint?: string } & Pick<
  React.ComponentProps<"input">,
  "placeholder" | "autoComplete" | "inputMode" | "maxLength" | "className"
>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field label={label} htmlFor={field.name} hint={hint} error={fieldState.error?.message}>
          <Input {...field} {...input} id={field.name} aria-invalid={fieldState.invalid || undefined} />
        </Field>
      )}
    />
  );
}
