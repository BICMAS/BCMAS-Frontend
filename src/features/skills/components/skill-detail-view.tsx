"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon } from "lucide-react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Field } from "@/components/shared/field";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { saveSkill } from "@/features/skills/services/mock-skills";
import type { SkillRecord } from "@/features/skills/types";

const skillFormSchema = z.object({
  name: z.string().min(2, "Skill name is required"),
  description: z.string().min(10, "Add a description"),
  levels: z
    .array(
      z.object({
        id: z.string(),
        level: z.number(),
        label: z.string().min(1, "Label required"),
        description: z.string().min(5, "Description required"),
      }),
    )
    .min(1),
});

type SkillFormInput = z.infer<typeof skillFormSchema>;

type SkillDetailViewProps = {
  skill: SkillRecord;
};

export function SkillDetailView({ skill }: SkillDetailViewProps) {
  const router = useRouter();
  const [activeLevel, setActiveLevel] = useState(String(skill.levels[0]?.level ?? 1));

  const form = useForm<SkillFormInput>({
    resolver: zodResolver(skillFormSchema),
    defaultValues: {
      name: skill.name,
      description: skill.description,
      levels: skill.levels,
    },
  });

  const { fields } = useFieldArray({ control: form.control, name: "levels" });
  const submitting = form.formState.isSubmitting;

  const persist = async (status: SkillRecord["status"]) => {
    const values = form.getValues();
    const parsed = skillFormSchema.safeParse(values);
    if (!parsed.success) {
      await form.trigger();
      toast.error("Fix validation errors before saving");
      return;
    }
    const updated = await saveSkill(skill.id, {
      ...parsed.data,
      status,
    });
    if (!updated) {
      toast.error("Unable to save skill");
      return;
    }
    toast.success(
      status === "published" ? "Skill published (mock)" : "Draft saved (mock)",
    );
    router.refresh();
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title={skill.name}
        description={skill.description}
        actions={
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={submitting}
              onClick={() => void persist("draft")}
            >
              Save draft
            </Button>
            <Button
              type="button"
              disabled={submitting}
              onClick={() => void persist("published")}
            >
              {submitting ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : null}
              Publish
            </Button>
          </>
        }
      />

      <form className="grid gap-8 lg:grid-cols-3" noValidate>
        <div className="space-y-4 lg:col-span-1">
          <Controller
            control={form.control}
            name="name"
            render={({ field, fieldState }) => (
              <Field
                label="Skill Name"
                htmlFor={field.name}
                error={fieldState.error?.message}
              >
                <Input {...field} id={field.name} />
              </Field>
            )}
          />
          <Controller
            control={form.control}
            name="description"
            render={({ field, fieldState }) => (
              <Field
                label="Description"
                htmlFor={field.name}
                error={fieldState.error?.message}
              >
                <Textarea {...field} id={field.name} rows={5} />
              </Field>
            )}
          />
          <div className="rounded-xl border border-border-slate bg-white p-4">
            <p className="mb-2 text-xs font-bold tracking-wider text-slate-400 uppercase">
              Used by roles
            </p>
            <div className="space-y-2">
              {skill.usedByRoleIds.length === 0 ? (
                <p className="text-sm text-slate-500">Not linked to roles yet.</p>
              ) : (
                skill.usedByRoleIds.map((roleId) => (
                  <Link
                    key={roleId}
                    href={`/roles/${roleId}`}
                    className="block text-sm font-bold text-navy hover:underline"
                  >
                    {roleId}
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          <Tabs value={activeLevel} onValueChange={setActiveLevel}>
            <TabsList>
              {fields.map((field) => (
                <TabsTrigger key={field.id} value={String(field.level)}>
                  L{field.level}
                </TabsTrigger>
              ))}
            </TabsList>
            {fields.map((field, index) => (
              <TabsContent
                key={field.id}
                value={String(field.level)}
                className="mt-4 space-y-4 rounded-xl border border-border-slate bg-white p-6"
              >
                <Controller
                  control={form.control}
                  name={`levels.${index}.label`}
                  render={({ field: f, fieldState }) => (
                    <Field
                      label="Level label"
                      htmlFor={f.name}
                      error={fieldState.error?.message}
                    >
                      <Input {...f} id={f.name} />
                    </Field>
                  )}
                />
                <Controller
                  control={form.control}
                  name={`levels.${index}.description`}
                  render={({ field: f, fieldState }) => (
                    <Field
                      label="Level description"
                      htmlFor={f.name}
                      error={fieldState.error?.message}
                    >
                      <Textarea {...f} id={f.name} rows={4} />
                    </Field>
                  )}
                />
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </form>
    </div>
  );
}
