"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Field } from "@/components/shared/field";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { listEmployeeRecords } from "@/features/employees/services/mock-employees";
import { listRoleRecords } from "@/features/roles/services/mock-roles";
import { PROFILE_STATUS_LABELS } from "@/lib/mock/types";
import { LibraryPicker } from "@/features/talent/components/library-picker";
import { listLibraryItems } from "@/features/talent/services/mock-library";
import { isApprovedRoleProfile } from "@/features/talent/services/mock-recruitment";
import { createPromotionAssessment, type PromotionAssessment } from "@/features/talent/services/mock-promotion";
import { useHydratedUser } from "@/features/talent/use-hydrated-user";
import { useSessionStore } from "@/stores/session-store";

const selectClass =
  "h-11 w-full rounded-lg border border-border-slate bg-slate-50 px-4 text-sm text-navy outline-none focus-visible:ring-2 focus-visible:ring-navy";

export function PromotionCreateView() {
  const user = useHydratedUser();
  const createdBy = useSessionStore((state) => state.user.name);
  const employees = useMemo(() => listEmployeeRecords(), []);
  const roles = useMemo(() => listRoleRecords(), []);
  const libraryItems = useMemo(() => listLibraryItems(), []);
  const [libraryItemIds, setLibraryItemIds] = useState<string[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [roleId, setRoleId] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<PromotionAssessment | null>(null);
  const employee = employees.find((item) => item.id === employeeId) ?? null;
  const role = roles.find((item) => item.id === roleId) ?? null;
  const blocked = Boolean(role && !isApprovedRoleProfile(role.status));
  const roleSkills = role
    ? [...role.technicalSkills.map((skill) => skill.name), ...role.behaviouralSkills]
    : [];

  if (!user) return null;
  if (user.portal === "employee" || user.portal === "line_manager") {
    return <p className="text-sm text-slate-500">Only HR / L&D can create a promotion assessment.</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        title="Create Promotion Assessment"
        description="Choose an existing employee, then the prospective approved role. BCMS loads that role profile."
      />

      {saved ? (
        <section className="rounded-2xl border border-border-slate bg-white p-6 shadow-sm">
          <h2 className="font-bold text-navy">Assignment created</h2>
          <p className="mt-2 text-sm text-slate-500">
            {saved.employeeName} is assigned to {saved.roleTitle}.
          </p>
          <Link href={`/me/promotion/${saved.id}/start`} className="mt-3 inline-block font-bold text-navy">
            {`/me/promotion/${saved.id}/start`}
          </Link>
        </section>
      ) : null}

      <form
        className="space-y-5 rounded-2xl border border-border-slate bg-white p-6 shadow-sm"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!employee || !role || !isApprovedRoleProfile(role.status) || !libraryItemIds.length) return;
          setSaving(true);
          try {
            const record = await createPromotionAssessment({
              employeeId: employee.id,
              employeeName: employee.name,
              currentRole: employee.roleTitle ?? "Unassigned",
              role,
              createdBy,
              libraryItemIds,
            });
            setSaved(record);
            toast.success("Promotion assessment created", { description: record.employeeName });
          } finally {
            setSaving(false);
          }
        }}
      >
        <Field label="Employee" htmlFor="employeeId">
          <select
            id="employeeId"
            className={selectClass}
            value={employeeId}
            onChange={(event) => setEmployeeId(event.target.value)}
          >
            <option value="">Select an employee</option>
            {employees.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.roleTitle ?? "No current role"}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Prospective role" htmlFor="roleId">
          <select
            id="roleId"
            className={selectClass}
            value={roleId}
            onChange={(event) => setRoleId(event.target.value)}
          >
            <option value="">Select an approved role profile</option>
            {roles.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title} ({PROFILE_STATUS_LABELS[item.status]})
              </option>
            ))}
          </select>
        </Field>
        {blocked && role ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-navy">
            <p>
              {role.title} is {PROFILE_STATUS_LABELS[role.status].toLowerCase()}. A promotion assessment can only
              use an approved role skills profile.
            </p>
            <Link href="/roles" className="mt-2 inline-block font-bold">
              Open Role Requirements
            </Link>
          </div>
        ) : null}
        {role && !blocked ? (
          <section className="rounded-xl bg-slate-50 p-4">
            <h2 className="font-bold text-navy">{role.title} profile</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              {role.technicalSkills.map((skill) => (
                <li key={skill.skillId}>
                  {skill.name} · required {skill.levelLabel}
                </li>
              ))}
              {role.behaviouralSkills.map((skill) => (
                <li key={skill}>{skill} · required Advanced</li>
              ))}
            </ul>
          </section>
        ) : null}
        <LibraryPicker
          items={libraryItems}
          selected={libraryItemIds}
          onChange={setLibraryItemIds}
          roleSkills={roleSkills}
        />
        <Button type="submit" disabled={saving || !employee || !role || blocked || !libraryItemIds.length}>
          {saving ? "Saving…" : "Assign assessment"}
        </Button>
      </form>
    </div>
  );
}
