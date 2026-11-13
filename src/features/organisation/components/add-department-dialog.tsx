"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Field } from "@/components/shared/field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createDepartmentSchema,
  type CreateDepartmentInput,
} from "@/features/organisation/schemas/department-schema";
import { createDepartment } from "@/features/organisation/services/mock-organisation";
import type { Department } from "@/features/organisation/types";

type AddDepartmentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (department: Department) => void;
};

export function AddDepartmentDialog({
  open,
  onOpenChange,
  onCreated,
}: AddDepartmentDialogProps) {
  const form = useForm<CreateDepartmentInput>({
    resolver: zodResolver(createDepartmentSchema),
    defaultValues: { name: "", tagCore: false },
  });

  const submitting = form.formState.isSubmitting;

  const onSubmit = form.handleSubmit(async (values) => {
    const department = await createDepartment({
      name: values.name,
      tag: values.tagCore ? "core" : null,
    });
    toast.success(`Department “${department.name}” created`);
    onCreated(department);
    form.reset({ name: "", tagCore: false });
    onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Department</DialogTitle>
          <DialogDescription>
            Create a new department in the organisational hierarchy. Roles can
            be assigned after creation.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Controller
            control={form.control}
            name="name"
            render={({ field, fieldState }) => (
              <Field
                label="Department Name"
                htmlFor={field.name}
                error={fieldState.error?.message}
              >
                <Input
                  {...field}
                  id={field.name}
                  placeholder="e.g. Customer Success"
                  aria-invalid={fieldState.invalid || undefined}
                />
              </Field>
            )}
          />

          <Controller
            control={form.control}
            name="tagCore"
            render={({ field }) => (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="tagCore"
                  checked={field.value}
                  onCheckedChange={(checked) =>
                    field.onChange(checked === true)
                  }
                />
                <Label
                  htmlFor="tagCore"
                  className="text-sm font-normal tracking-normal text-slate-600 normal-case"
                >
                  Mark as CORE department
                </Label>
              </div>
            )}
          />

          <DialogFooter className="-mx-6 -mb-6">
            <Button
              type="button"
              variant="secondary"
              disabled={submitting}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2Icon className="size-4 animate-spin" />
                  Creating…
                </>
              ) : (
                "Create Department"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
