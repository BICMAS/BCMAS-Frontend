"use client";

import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { DateField } from "@/components/shared/date-field";
import { Field } from "@/components/shared/field";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listRoleRecords } from "@/features/roles/services/mock-roles";
import { PROFILE_STATUS_LABELS } from "@/lib/mock/types";
import { LibraryPicker } from "@/features/talent/components/library-picker";
import { listLibraryItems } from "@/features/talent/services/mock-library";
import {
  createRecruitmentAssessment,
  invitePath,
  isApprovedRoleProfile,
  type RecruitmentAssessment,
} from "@/features/talent/services/mock-recruitment";
import { useSessionStore } from "@/stores/session-store";

const schema = z.object({
  roleId: z.string().min(1, "Select a role"),
  candidateName: z.string().trim().min(2, "Enter the candidate name"),
  email: z.string().trim().email("Enter a valid email"),
  duration: z.enum(["30", "45", "60", "90"]),
  deadline: z.string().min(1, "Choose a deadline"),
});

type CreateInput = z.infer<typeof schema>;

const selectClass =
  "h-11 w-full rounded-lg border border-border-slate bg-slate-50 px-4 text-sm text-navy outline-none focus-visible:ring-2 focus-visible:ring-navy";

export function RecruitmentCreateView() {
  const createdBy = useSessionStore((state) => state.user.name);
  const roles = useMemo(() => listRoleRecords(), []);
  const libraryItems = useMemo(() => listLibraryItems(), []);
  const [libraryItemIds, setLibraryItemIds] = useState<string[]>([]);
  const [libraryError, setLibraryError] = useState("");
  const [saved, setSaved] = useState<RecruitmentAssessment | null>(null);
  const [saving, setSaving] = useState(false);
  const form = useForm<CreateInput>({
    resolver: zodResolver(schema),
    defaultValues: {
      roleId: "",
      candidateName: "",
      email: "",
      duration: "60",
      deadline: "",
    },
  });
  const roleId = useWatch({ control: form.control, name: "roleId" });
  const selected = roles.find((role) => role.id === roleId) ?? null;
  const blocked = Boolean(selected && !isApprovedRoleProfile(selected.status));
  const roleSkills = selected
    ? [...selected.technicalSkills.map((skill) => skill.name), ...selected.behaviouralSkills]
    : [];

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        title="Create Assessment"
        description="Choose an approved role skills profile, then invite the candidate."
      />

      {saved ? (
        <section className="rounded-2xl border border-border-slate bg-white p-6 shadow-sm">
          <h2 className="font-bold text-navy">Invite ready</h2>
          <p className="mt-1 text-sm text-slate-500">
            {saved.candidateName} can open this unique invite path.
          </p>
          <Link href={invitePath(saved.inviteToken)} className="mt-3 inline-block font-bold text-navy">
            {invitePath(saved.inviteToken)}
          </Link>
          <div className="mt-4">
            <Link href={`/talent/recruitment/${saved.id}`} className="text-sm font-bold text-navy">
              Open assessment
            </Link>
          </div>
        </section>
      ) : null}

      <form
        className="space-y-5 rounded-2xl border border-border-slate bg-white p-6 shadow-sm"
        onSubmit={form.handleSubmit(async (values) => {
          const role = roles.find((item) => item.id === values.roleId);
          if (!role || !isApprovedRoleProfile(role.status)) {
            form.setError("roleId", { message: "This role skills profile is not approved." });
            return;
          }
          if (!libraryItemIds.length) {
            setLibraryError("Select at least one library item.");
            return;
          }
          setLibraryError("");
          setSaving(true);
          try {
            const record = await createRecruitmentAssessment({
              role,
              candidateName: values.candidateName,
              email: values.email,
              durationMinutes: Number(values.duration),
              deadline: values.deadline,
              createdBy,
              libraryItemIds,
            });
            setSaved(record);
            setLibraryItemIds([]);
            form.reset();
            toast.success("Assessment created", { description: invitePath(record.inviteToken) });
          } finally {
            setSaving(false);
          }
        })}
      >
        <Field label="Role" htmlFor="roleId" error={form.formState.errors.roleId?.message}>
          <select id="roleId" className={selectClass} {...form.register("roleId")}>
            <option value="">Select a role skills profile</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.title} ({PROFILE_STATUS_LABELS[role.status]})
              </option>
            ))}
          </select>
        </Field>

        {blocked && selected ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-navy">
            <p>
              {selected.title} is {PROFILE_STATUS_LABELS[selected.status].toLowerCase()}. An assessment
              can only be created from an approved role skills profile.
            </p>
            <Link href="/roles" className="mt-2 inline-block font-bold">
              Open Role Requirements
            </Link>
          </div>
        ) : null}

        <Field label="Candidate name" htmlFor="candidateName" error={form.formState.errors.candidateName?.message}>
          <Input id="candidateName" {...form.register("candidateName")} />
        </Field>
        <Field label="Candidate email" htmlFor="email" error={form.formState.errors.email?.message}>
          <Input id="email" type="email" {...form.register("email")} />
        </Field>
        <Field label="Duration" htmlFor="duration" hint="Minutes allowed for the assessment.">
          <select id="duration" className={selectClass} {...form.register("duration")}>
            <option value="30">30 minutes</option>
            <option value="45">45 minutes</option>
            <option value="60">60 minutes</option>
            <option value="90">90 minutes</option>
          </select>
        </Field>
        <DateField control={form.control} name="deadline" label="Deadline" />
        <LibraryPicker
          items={libraryItems}
          selected={libraryItemIds}
          onChange={(ids) => {
            setLibraryItemIds(ids);
            if (ids.length) setLibraryError("");
          }}
          roleSkills={roleSkills}
        />
        {libraryError ? <p className="text-sm font-medium text-error-soft-foreground">{libraryError}</p> : null}
        <Button type="submit" disabled={saving || blocked || !libraryItemIds.length}>
          {saving ? "Saving…" : "Save assessment"}
        </Button>
      </form>
    </div>
  );
}
