"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Field } from "@/components/shared/field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  createRoleSchema,
  type CreateRoleInput,
} from "@/features/roles/schemas/role-schemas";
import {
  createRole,
  roleDepartments,
} from "@/features/roles/services/mock-roles";
import type { RoleRecord } from "@/features/roles/types";

type CreateRoleDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (role: RoleRecord) => void;
};

export function CreateRoleDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateRoleDialogProps) {
  const form = useForm<CreateRoleInput>({
    resolver: zodResolver(createRoleSchema),
    defaultValues: {
      title: "",
      departmentId: "",
      overview: "",
    },
  });

  const submitting = form.formState.isSubmitting;

  const onSubmit = form.handleSubmit(async (values) => {
    const dept = roleDepartments.find((d) => d.id === values.departmentId);
    if (!dept) {
      toast.error("Select a valid department");
      return;
    }
    const role = await createRole({
      title: values.title,
      departmentId: dept.id,
      departmentName: dept.name,
      overview: values.overview,
    });
    toast.success(`Created “${role.title}”`);
    form.reset();
    onCreated(role);
    onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Role</DialogTitle>
          <DialogDescription>
            Add a role to the directory. You can generate an AI skills profile
            afterwards.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Controller
            control={form.control}
            name="title"
            render={({ field, fieldState }) => (
              <Field
                label="Role Title"
                htmlFor={field.name}
                error={fieldState.error?.message}
              >
                <Input {...field} id={field.name} placeholder="e.g. Product Owner" />
              </Field>
            )}
          />
          <Controller
            control={form.control}
            name="departmentId"
            render={({ field, fieldState }) => (
              <Field
                label="Department"
                htmlFor={field.name}
                error={fieldState.error?.message}
              >
                <select
                  {...field}
                  id={field.name}
                  className="h-11 w-full rounded-lg border border-border-slate bg-slate-50 px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-navy"
                >
                  <option value="">Select department</option>
                  {roleDepartments.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          />
          <Controller
            control={form.control}
            name="overview"
            render={({ field, fieldState }) => (
              <Field
                label="Overview"
                htmlFor={field.name}
                error={fieldState.error?.message}
              >
                <Textarea
                  {...field}
                  id={field.name}
                  rows={3}
                  placeholder="Describe the purpose of this role…"
                />
              </Field>
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
                "Create Role"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
