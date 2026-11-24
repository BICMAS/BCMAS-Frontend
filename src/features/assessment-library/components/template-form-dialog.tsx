"use client";

import { useState } from "react";

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
  ASSESSMENT_TYPES,
  ASSESSMENT_TYPE_LABEL,
  PROFICIENCY_LEVELS,
  type AssessmentType,
  type ProficiencyLevel,
  type TemplateContent,
} from "../types";
import { ROLE_FAMILIES, fieldSelectClass } from "./library-shared";

export type TemplateSettings = Omit<TemplateContent, "items">;

const EMPTY: TemplateSettings = {
  name: "",
  purpose: "",
  assessmentType: "situational_judgement",
  roleFamily: "Sales",
  targetProficiency: "Proficient",
  competencies: [],
  durationMinutes: 30,
};

/** Create Master / Edit Master: purpose, role family, type, competencies and other settings. */
export function TemplateFormDialog({
  open,
  onOpenChange,
  initial,
  title,
  submitLabel,
  onSubmit,
  roleField,
  description = "Master templates are reusable source material for every organisation.",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: TemplateSettings;
  title: string;
  submitLabel: string;
  onSubmit: (settings: TemplateSettings, linkedRole: string | null) => void;
  /** Adds a "Linked role" field (organisation assessments). */
  roleField?: { initial: string | null; options: string[] };
  description?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        {open ? (
          <TemplateForm
            initial={initial ?? EMPTY}
            title={title}
            submitLabel={submitLabel}
            onCancel={() => onOpenChange(false)}
            onSubmit={onSubmit}
            roleField={roleField}
            description={description}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function TemplateForm({
  initial,
  title,
  submitLabel,
  onCancel,
  onSubmit,
  roleField,
  description,
}: {
  initial: TemplateSettings;
  title: string;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (settings: TemplateSettings, linkedRole: string | null) => void;
  roleField?: { initial: string | null; options: string[] };
  description: string;
}) {
  const [form, setForm] = useState<TemplateSettings>(initial);
  const [role, setRole] = useState(roleField?.initial ?? "");
  const [competencyText, setCompetencyText] = useState(initial.competencies.join(", "));
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof TemplateSettings>(key: K, value: TemplateSettings[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  function submit() {
    const competencies = [...new Set(competencyText.split(",").map((c) => c.trim()).filter(Boolean))];
    if (!form.name.trim()) return setError("Enter a template name.");
    if (!form.purpose.trim()) return setError("Describe the template's purpose.");
    if (competencies.length === 0) return setError("Add at least one target competency.");
    if (!Number.isFinite(form.durationMinutes) || form.durationMinutes < 5 || form.durationMinutes > 180) {
      return setError("Estimated duration must be between 5 and 180 minutes.");
    }
    onSubmit({ ...form, name: form.name.trim(), purpose: form.purpose.trim(), competencies }, role.trim() || null);
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-bold text-navy sm:col-span-2">
          Template name
          <Input className="mt-1" value={form.name} maxLength={120} onChange={(e) => set("name", e.target.value)} />
        </label>
        <label className="text-xs font-bold text-navy sm:col-span-2">
          Purpose
          <Textarea
            className="mt-1"
            rows={2}
            value={form.purpose}
            maxLength={500}
            onChange={(e) => set("purpose", e.target.value)}
          />
        </label>
        <label className="text-xs font-bold text-navy">
          Assessment type
          <select
            className={fieldSelectClass}
            value={form.assessmentType}
            onChange={(e) => set("assessmentType", e.target.value as AssessmentType)}
          >
            {ASSESSMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {ASSESSMENT_TYPE_LABEL[type]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-bold text-navy">
          Role family
          <select className={fieldSelectClass} value={form.roleFamily} onChange={(e) => set("roleFamily", e.target.value)}>
            {ROLE_FAMILIES.map((family) => (
              <option key={family}>{family}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-bold text-navy">
          Target proficiency
          <select
            className={fieldSelectClass}
            value={form.targetProficiency}
            onChange={(e) => set("targetProficiency", e.target.value as ProficiencyLevel)}
          >
            {PROFICIENCY_LEVELS.map((level) => (
              <option key={level}>{level}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-bold text-navy">
          Estimated duration (minutes)
          <Input
            className="mt-1"
            type="number"
            min={5}
            max={180}
            value={form.durationMinutes}
            onChange={(e) => set("durationMinutes", Number(e.target.value))}
          />
        </label>
        {roleField ? (
          <label className="text-xs font-bold text-navy sm:col-span-2">
            Linked role (optional)
            <Input
              className="mt-1"
              list="org-role-options"
              value={role}
              placeholder="e.g. Sales Executive"
              onChange={(e) => setRole(e.target.value)}
            />
            <datalist id="org-role-options">
              {roleField.options.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </label>
        ) : null}
        <label className="text-xs font-bold text-navy sm:col-span-2">
          Target competencies (comma separated)
          <Input
            className="mt-1"
            value={competencyText}
            placeholder="Planning, Customer focus, Problem solving"
            onChange={(e) => setCompetencyText(e.target.value)}
          />
        </label>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-error-soft-foreground">
          {error}
        </p>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" onClick={submit}>
          {submitLabel}
        </Button>
      </DialogFooter>
    </>
  );
}
