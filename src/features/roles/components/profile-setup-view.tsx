"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon, SparklesIcon } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Field } from "@/components/shared/field";
import { FileDropzone } from "@/components/shared/file-dropzone";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  profileSetupSchema,
  type ProfileSetupInput,
} from "@/features/roles/schemas/role-schemas";
import {
  roleDepartments,
  saveProfileDraft,
} from "@/features/roles/services/mock-roles";
import type { RoleRecord } from "@/features/roles/types";

type ProfileSetupViewProps = {
  role: RoleRecord;
};

export function ProfileSetupView({ role }: ProfileSetupViewProps) {
  const router = useRouter();
  const [fileName, setFileName] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const form = useForm<ProfileSetupInput>({
    resolver: zodResolver(profileSetupSchema),
    defaultValues: {
      title: role.title,
      departmentId: role.departmentId,
      overview: role.overview,
      jdText: "",
      useSfia: true,
      useInternalFramework: true,
    },
  });

  const submitting = form.formState.isSubmitting;

  const onSubmit = form.handleSubmit(async (values) => {
    setGenerating(true);
    try {
      const updated = await saveProfileDraft(role.id, values);
      if (!updated) {
        toast.error("Could not save profile draft");
        return;
      }
      toast.success("Profile draft generated (mock AI)");
      router.push(`/roles/${role.id}/profile/review`);
    } finally {
      setGenerating(false);
    }
  });

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader
        title="Build Role Skills Profile"
        description="Let AI assist you in creating a comprehensive skills profile by extracting requirements from job descriptions and knowledge bases."
      />

      <form onSubmit={onSubmit} className="space-y-8" noValidate>
        <section className="overflow-hidden rounded-xl border border-border-slate bg-white shadow-sm">
          <div className="border-b border-border-slate bg-slate-50/50 px-8 py-5">
            <h3 className="text-sm font-bold tracking-wider text-navy uppercase">
              1. Role Information
            </h3>
          </div>
          <div className="grid grid-cols-1 gap-6 p-8 md:grid-cols-2">
            <Controller
              control={form.control}
              name="title"
              render={({ field, fieldState }) => (
                <Field
                  label="Role Title"
                  htmlFor={field.name}
                  error={fieldState.error?.message}
                >
                  <Input {...field} id={field.name} />
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
                    className="h-11 w-full rounded-lg border border-border-slate bg-white px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-navy"
                  >
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
                  label="Role Objective"
                  htmlFor={field.name}
                  error={fieldState.error?.message}
                  className="md:col-span-2"
                >
                  <Textarea {...field} id={field.name} rows={3} />
                </Field>
              )}
            />
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-border-slate bg-white shadow-sm">
          <div className="border-b border-border-slate bg-slate-50/50 px-8 py-5">
            <h3 className="text-sm font-bold tracking-wider text-navy uppercase">
              2. Job Description
            </h3>
          </div>
          <div className="space-y-4 p-8">
            <FileDropzone
              accept=".pdf,.doc,.docx,.txt"
              maxBytes={10 * 1024 * 1024}
              title="Upload JD Document"
              hint="PDF, DOCX, or TXT supported (Max 10MB)"
              selectedName={fileName}
              onInvalid={(message) => toast.error(message)}
              onFile={async (file) => {
                setFileName(file.name);
                form.setValue(
                  "jdText",
                  `Attached document: ${file.name} (mock extracted text)`,
                );
                toast.success(`Attached ${file.name}`);
              }}
            />
            <Controller
              control={form.control}
              name="jdText"
              render={({ field }) => (
                <Field label="Or paste JD text" htmlFor={field.name}>
                  <Textarea
                    {...field}
                    id={field.name}
                    rows={4}
                    placeholder="Paste job description text…"
                  />
                </Field>
              )}
            />
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-border-slate bg-white shadow-sm">
          <div className="border-b border-border-slate bg-slate-50/50 px-8 py-5">
            <h3 className="text-sm font-bold tracking-wider text-navy uppercase">
              3. Knowledge Sources
            </h3>
          </div>
          <div className="grid grid-cols-1 gap-4 p-8 md:grid-cols-2">
            <Controller
              control={form.control}
              name="useInternalFramework"
              render={({ field }) => (
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border-slate p-4 hover:bg-slate-50">
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={(checked) =>
                      field.onChange(checked === true)
                    }
                  />
                  <span>
                    <span className="block text-sm font-bold text-navy">
                      Internal Framework
                    </span>
                    <span className="text-xs text-slate-500">
                      Use organisation competency library
                    </span>
                  </span>
                </label>
              )}
            />
            <Controller
              control={form.control}
              name="useSfia"
              render={({ field }) => (
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border-slate p-4 hover:bg-slate-50">
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={(checked) =>
                      field.onChange(checked === true)
                    }
                  />
                  <span>
                    <span className="block text-sm font-bold text-navy">
                      SFIA / Industry Standards
                    </span>
                    <Label className="sr-only">SFIA</Label>
                    <span className="text-xs text-slate-500">
                      Reference external skill frameworks
                    </span>
                  </span>
                </label>
              )}
            />
          </div>
        </section>

        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.push(`/roles/${role.id}`)}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={submitting || generating}>
            {submitting || generating ? (
              <>
                <Loader2Icon className="size-4 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <SparklesIcon className="size-4" aria-hidden />
                Generate & Review
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
