"use client";

import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Field } from "@/components/shared/field";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RoleStatusBadge } from "@/features/roles/components/role-status-badge";
import {
  profileReviewSchema,
  type ProfileReviewInput,
} from "@/features/roles/schemas/role-schemas";
import { updateRoleStatus } from "@/features/roles/services/mock-roles";
import type { RoleRecord } from "@/features/roles/types";

type ProfileReviewViewProps = {
  role: RoleRecord;
};

export function ProfileReviewView({ role }: ProfileReviewViewProps) {
  const router = useRouter();
  const form = useForm<ProfileReviewInput>({
    resolver: zodResolver(profileReviewSchema),
    defaultValues: { decision: "approve", comments: "" },
  });
  const submitting = form.formState.isSubmitting;

  const onSubmit = form.handleSubmit(async (values) => {
    if (values.decision === "request_changes" && !values.comments?.trim()) {
      form.setError("comments", {
        message: "Add comments when requesting changes",
      });
      return;
    }
    const status =
      values.decision === "approve" ? "published" : "changes_requested";
    const updated = await updateRoleStatus(role.id, status);
    if (!updated) {
      toast.error("Unable to update profile");
      return;
    }
    toast.success(
      values.decision === "approve"
        ? "Profile approved and published (mock)"
        : "Changes requested (mock)",
    );
    router.push(`/roles/${role.id}`);
  });

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader
        title="Review Skills Profile"
        description={`Validate AI-generated competencies for ${role.title}.`}
        actions={<RoleStatusBadge status={role.status} />}
      />

      <div className="rounded-xl border border-border-slate bg-white p-8 shadow-sm">
        <h3 className="mb-4 font-bold text-navy">Proposed technical skills</h3>
        <div className="grid gap-3 md:grid-cols-2">
          {role.technicalSkills.map((skill) => (
            <div
              key={skill.skillId}
              className="flex items-center justify-between rounded-lg border border-border-slate bg-slate-50 p-3"
            >
              <span className="text-sm font-medium">{skill.name}</span>
              <Badge className="rounded bg-navy text-white">
                {skill.levelLabel}
              </Badge>
            </div>
          ))}
        </div>
        <h3 className="mt-8 mb-3 font-bold text-navy">Behavioural skills</h3>
        <div className="flex flex-wrap gap-2">
          {role.behaviouralSkills.map((skill) => (
            <span
              key={skill}
              className="rounded-full border border-border-slate px-3 py-1.5 text-xs font-semibold text-slate-600"
            >
              {skill}
            </span>
          ))}
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-border-slate bg-white p-8 shadow-sm" noValidate>
        <Controller
          control={form.control}
          name="decision"
          render={({ field }) => (
            <Field label="Decision" htmlFor={field.name}>
              <select
                {...field}
                id={field.name}
                className="h-11 w-full rounded-lg border border-border-slate bg-slate-50 px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-navy"
              >
                <option value="approve">Approve & publish</option>
                <option value="request_changes">Request changes</option>
              </select>
            </Field>
          )}
        />
        <Controller
          control={form.control}
          name="comments"
          render={({ field, fieldState }) => (
            <Field
              label="Reviewer comments"
              htmlFor={field.name}
              error={fieldState.error?.message}
            >
              <Textarea
                {...field}
                id={field.name}
                rows={3}
                placeholder="Optional notes for the profile author"
              />
            </Field>
          )}
        />
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.push(`/roles/${role.id}/profile/setup`)}
          >
            Back to setup
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? (
              <>
                <Loader2Icon className="size-4 animate-spin" />
                Saving…
              </>
            ) : (
              "Submit decision"
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
