"use client";

import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { roleCompetencies } from "@/features/assessment-library/services/ai-builder";

import {
  approvedRoleProfiles,
  assessmentOptions,
  interviewSetOptions,
  hiringManagerOptions,
  type VacancyDetails,
} from "../services/vacancies";
import { EMPLOYMENT_TYPES, type EmploymentType } from "../types";

const fieldClass =
  "mt-1 h-10 w-full rounded-lg border border-border-slate bg-white px-3 text-sm text-navy outline-none disabled:bg-slate-50 disabled:text-slate-500";

/**
 * Vacancy Details · Role Profile · Assessment Setup · Thresholds (guide §9).
 * Controlled: the parent owns the details and decides when to save.
 */
export function VacancyEditor({
  organisationId,
  value,
  onChange,
  readOnly,
  tab,
  onTabChange,
  extraTabs,
}: {
  organisationId: string;
  value: VacancyDetails;
  onChange: (next: VacancyDetails) => void;
  readOnly: boolean;
  tab: string;
  onTabChange: (tab: string) => void;
  /** Additional tabs (Approval, Candidate Link, Applicants…) rendered after the four setup tabs. */
  extraTabs?: Array<{ value: string; label: string; content: React.ReactNode }>;
}) {
  const roles = useMemo(() => approvedRoleProfiles(), []);
  const assessments = useMemo(() => assessmentOptions(organisationId), [organisationId]);
  const managers = useMemo(() => hiringManagerOptions(organisationId), [organisationId]);
  const interviewSets = useMemo(() => interviewSetOptions(organisationId), [organisationId]);
  const role = roles.find((r) => r.id === value.roleId) ?? null;
  const set = <K extends keyof VacancyDetails>(key: K, next: VacancyDetails[K]) => onChange({ ...value, [key]: next });
  const selectedAssessment = value.assessment
    ? assessments.find((a) => a.assessmentId === value.assessment!.assessmentId && a.version === value.assessment!.version)
    : null;

  return (
    <Tabs value={tab} onValueChange={(v) => onTabChange(String(v))}>
      <TabsList variant="line" className="flex-wrap">
        <TabsTrigger value="details">Vacancy Details</TabsTrigger>
        <TabsTrigger value="role">Role Profile</TabsTrigger>
        <TabsTrigger value="assessment">Assessment Setup</TabsTrigger>
        <TabsTrigger value="thresholds">Thresholds</TabsTrigger>
        {extraTabs?.map((t) => (
          <TabsTrigger key={t.value} value={t.value}>
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value="details" className="mt-6">
        <div className="grid gap-4 rounded-2xl border border-border-slate bg-white p-6 shadow-sm sm:grid-cols-2">
          <label className="text-xs font-bold text-navy sm:col-span-2">
            Vacancy title
            <Input className="mt-1" disabled={readOnly} value={value.title} maxLength={120} onChange={(e) => set("title", e.target.value)} />
          </label>
          <label className="text-xs font-bold text-navy">
            Department
            <Input className="mt-1" disabled={readOnly} value={value.department} onChange={(e) => set("department", e.target.value)} />
          </label>
          <label className="text-xs font-bold text-navy">
            Location
            <Input className="mt-1" disabled={readOnly} value={value.location} onChange={(e) => set("location", e.target.value)} />
          </label>
          <label className="text-xs font-bold text-navy">
            Employment type
            <select
              className={fieldClass}
              disabled={readOnly}
              value={value.employmentType}
              onChange={(e) => set("employmentType", e.target.value as EmploymentType)}
            >
              {EMPLOYMENT_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-bold text-navy">
            Number of openings
            <Input
              className="mt-1"
              type="number"
              min={1}
              disabled={readOnly}
              value={value.openings}
              onChange={(e) => set("openings", Number(e.target.value))}
            />
          </label>
          <label className="text-xs font-bold text-navy">
            Closing date
            <Input
              className="mt-1"
              type="date"
              disabled={readOnly}
              value={value.closingDate}
              onChange={(e) => set("closingDate", e.target.value)}
            />
          </label>
          <label className="text-xs font-bold text-navy">
            Hiring Manager (approves thresholds)
            <select
              className={fieldClass}
              disabled={readOnly}
              value={value.hiringManager?.userId ?? ""}
              onChange={(e) => {
                const m = managers.find((x) => x.userId === e.target.value);
                set("hiringManager", m ? { userId: m.userId, name: m.name } : null);
              }}
            >
              <option value="">Choose…</option>
              {managers.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name} · {m.jobTitle}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-bold text-navy sm:col-span-2">
            Job summary (shown to candidates)
            <Textarea
              className="mt-1 font-normal"
              rows={4}
              disabled={readOnly}
              value={value.summary}
              maxLength={2000}
              onChange={(e) => set("summary", e.target.value)}
            />
          </label>
          <label className="text-xs font-bold text-navy sm:col-span-2">
            Consent and privacy wording (approved by your organisation)
            <Textarea
              className="mt-1 font-normal"
              rows={4}
              disabled={readOnly}
              value={value.consentText}
              onChange={(e) => set("consentText", e.target.value)}
            />
            <span className="mt-1 block font-normal text-slate-400">{"{organisation}"} is replaced with your organisation&apos;s name.</span>
          </label>
        </div>
      </TabsContent>

      <TabsContent value="role" className="mt-6 space-y-4">
        <label className="block max-w-md text-xs font-bold text-navy">
          Approved BCMS role profile
          <select
            className={fieldClass}
            disabled={readOnly}
            value={value.roleId ?? ""}
            onChange={(e) => set("roleId", e.target.value || null)}
          >
            <option value="">Choose…</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title} · {r.departmentName}
              </option>
            ))}
          </select>
        </label>
        {role ? (
          <div className="overflow-x-auto rounded-xl border border-border-slate bg-white">
            <table className="w-full text-left text-sm" aria-label="Role requirements">
              <thead className="bg-slate-50 text-[10px] tracking-widest text-slate-400 uppercase">
                <tr>
                  <th className="px-4 py-3">Required skill</th>
                  <th className="px-4 py-3">Target proficiency</th>
                  <th className="px-4 py-3">Category</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-slate">
                {roleCompetencies(role).map((c) => (
                  <tr key={c.name}>
                    <td className="px-4 py-3 font-semibold text-navy">{c.name}</td>
                    <td className="px-4 py-3">{c.level}</td>
                    <td className="px-4 py-3 capitalize">{c.category}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Choose the role profile candidates are assessed against.</p>
        )}
      </TabsContent>

      <TabsContent value="assessment" className="mt-6 space-y-4">
        <div className="space-y-4 rounded-2xl border border-border-slate bg-white p-6 shadow-sm">
          <p className="text-sm text-navy">
            <span className="font-bold">CV analysis</span> is always on: BCMS compares CV evidence with the role profile
            for people to review.
          </p>
          <label className="flex items-center gap-2 text-sm font-bold text-navy">
            <Checkbox
              disabled={readOnly}
              checked={value.stages.assessment.enabled}
              onCheckedChange={(checked) =>
                set("stages", { ...value.stages, assessment: { ...value.stages.assessment, enabled: checked === true } })
              }
            />
            Role-based assessment
          </label>
          {value.stages.assessment.enabled ? (
            <label className="block max-w-xl text-xs font-bold text-navy">
              Approved assessment version
              <select
                className={fieldClass}
                disabled={readOnly}
                value={value.assessment ? `${value.assessment.assessmentId}@${value.assessment.version}` : ""}
                onChange={(e) => {
                  const a = assessments.find((x) => `${x.assessmentId}@${x.version}` === e.target.value);
                  set("assessment", a ?? null);
                }}
              >
                <option value="">Choose…</option>
                {assessments.map((a) => (
                  <option key={`${a.assessmentId}@${a.version}`} value={`${a.assessmentId}@${a.version}`}>
                    {a.name} · v{a.version} · {a.itemCount} questions · {a.durationMinutes} min
                  </option>
                ))}
              </select>
              <span className="mt-1 block font-normal text-slate-400">
                Only approved, active versions are listed. Every candidate for this vacancy gets exactly this version.
              </span>
              {value.assessment && !selectedAssessment ? (
                <span className="mt-1 block font-semibold text-error-soft-foreground">
                  {value.assessment.name} v{value.assessment.version} is no longer approved and active. Choose another version.
                </span>
              ) : null}
            </label>
          ) : null}
          <label className="flex items-center gap-2 text-sm font-bold text-navy">
            <Checkbox
              disabled={readOnly}
              checked={value.stages.interview.enabled}
              onCheckedChange={(checked) =>
                set("stages", {
                  ...value.stages,
                  interview: {
                    ...value.stages.interview,
                    enabled: checked === true,
                    threshold: value.stages.interview.threshold ?? (checked === true ? 65 : null),
                  },
                })
              }
            />
            AI-avatar competency interview
          </label>
          {value.stages.interview.enabled ? (
            <label className="block max-w-xl text-xs font-bold text-navy">
              Approved interview question set
              <select
                className={fieldClass}
                disabled={readOnly}
                value={value.stages.interview.questionSet ? `${value.stages.interview.questionSet.assessmentId}@${value.stages.interview.questionSet.version}` : ""}
                onChange={(e) => {
                  const q = interviewSets.find((x) => `${x.assessmentId}@${x.version}` === e.target.value) ?? null;
                  set("stages", { ...value.stages, interview: { ...value.stages.interview, questionSet: q } });
                }}
              >
                <option value="">Choose…</option>
                {interviewSets.map((a) => (
                  <option key={`${a.assessmentId}@${a.version}`} value={`${a.assessmentId}@${a.version}`}>
                    {a.name} · v{a.version} · {a.itemCount} questions
                  </option>
                ))}
              </select>
              <span className="mt-1 block font-normal text-slate-400">
                Approved organisation assessments made only of written questions with rubrics. Every candidate is asked
                the same questions.
              </span>
            </label>
          ) : null}
          <p className="text-xs text-slate-500">
            The interview asks consistent, role-linked questions and scores answer content only — never appearance,
            accent or expression. Candidates can answer by voice or text.
          </p>
        </div>
      </TabsContent>

      <TabsContent value="thresholds" className="mt-6 space-y-3">
        <div className="overflow-x-auto rounded-xl border border-border-slate bg-white">
          <table className="w-full text-left text-sm" aria-label="Stage thresholds">
            <thead className="bg-slate-50 text-[10px] tracking-widest text-slate-400 uppercase">
              <tr>
                <th className="px-4 py-3">Stage</th>
                <th className="px-4 py-3">Selected version</th>
                <th className="px-4 py-3">Minimum pass score</th>
                <th className="px-4 py-3">Approver</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-slate">
              <tr>
                <td className="px-4 py-3 font-semibold text-navy">CV analysis</td>
                <td className="px-4 py-3">{role ? `Role profile: ${role.title}` : "—"}</td>
                <td className="px-4 py-3">
                  <Badge variant="secondary">Human review</Badge>
                </td>
                <td className="px-4 py-3">{value.hiringManager?.name ?? "—"}</td>
              </tr>
              {value.stages.assessment.enabled ? (
                <ThresholdRow
                  label="Role-based assessment"
                  version={value.assessment ? `${value.assessment.name} v${value.assessment.version}` : "—"}
                  threshold={value.stages.assessment.threshold}
                  approver={value.hiringManager?.name}
                  readOnly={readOnly}
                  onChange={(threshold) => set("stages", { ...value.stages, assessment: { ...value.stages.assessment, threshold } })}
                />
              ) : null}
              {value.stages.interview.enabled ? (
                <ThresholdRow
                  label="AI-avatar interview"
                  version={value.stages.interview.questionSet ? `${value.stages.interview.questionSet.name} v${value.stages.interview.questionSet.version}` : "—"}
                  threshold={value.stages.interview.threshold}
                  approver={value.hiringManager?.name}
                  readOnly={readOnly}
                  onChange={(threshold) => set("stages", { ...value.stages, interview: { ...value.stages.interview, threshold } })}
                />
              ) : null}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-500">
          Thresholds apply to this vacancy only. The Hiring Manager approves them before publication, and the approved
          values are stored with every candidate&apos;s attempt and decision.
        </p>
      </TabsContent>

      {extraTabs?.map((t) => (
        <TabsContent key={t.value} value={t.value} className="mt-6">
          {t.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}

function ThresholdRow({
  label,
  version,
  threshold,
  approver,
  readOnly,
  onChange,
}: {
  label: string;
  version: string;
  threshold: number | null;
  approver?: string;
  readOnly: boolean;
  onChange: (value: number | null) => void;
}) {
  return (
    <tr>
      <td className="px-4 py-3 font-semibold text-navy">{label}</td>
      <td className="px-4 py-3">{version}</td>
      <td className="px-4 py-3">
        <span className="inline-flex items-center gap-1">
          <Input
            aria-label={`${label} pass threshold`}
            className="h-9 w-20"
            type="number"
            min={1}
            max={100}
            disabled={readOnly}
            value={threshold ?? ""}
            onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          />
          %
        </span>
      </td>
      <td className="px-4 py-3">{approver ?? "—"}</td>
    </tr>
  );
}
