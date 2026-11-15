"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Field } from "@/components/shared/field";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlatformGate } from "@/features/platform/components/platform-gate";
import {
  getProvisioningDraft,
  provisionTenant,
  saveProvisioningDraft,
  tenantPlans,
  tenantRegions,
  type ProvisionDraft,
  type TenantRecord,
} from "@/features/platform/services/mock-platform";
import { usePlatformRevision } from "@/features/platform/use-platform-store";
import { useSessionStore } from "@/stores/session-store";

const schema = z.object({
  legalName: z.string().trim().min(2, "Enter the legal entity name"),
  slug: z
    .string()
    .trim()
    .min(2, "Enter a URL slug")
    .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers, and hyphens"),
  region: z.string().min(1, "Choose a region"),
  plan: z.enum(["Enterprise Plus", "Standard", "Pilot / Trial"]),
  aiCoaching: z.boolean(),
  multiBu: z.boolean(),
  saml: z.boolean(),
  adminName: z.string().trim().min(2, "Enter the admin name"),
  adminEmail: z.string().trim().email("Enter a valid admin email"),
});

type ProvisionInput = z.infer<typeof schema>;

const selectClass =
  "h-11 w-full rounded-lg border border-border-slate bg-slate-50 px-4 text-sm font-bold text-navy outline-none focus-visible:ring-2 focus-visible:ring-navy";

const emptyDraft: ProvisionInput = {
  legalName: "",
  slug: "",
  region: tenantRegions[0],
  plan: "Enterprise Plus",
  aiCoaching: true,
  multiBu: true,
  saml: false,
  adminName: "",
  adminEmail: "",
};

export function ProvisionTenantView() {
  usePlatformRevision();
  const actor = useSessionStore((state) => state.user.name);
  const stored = getProvisioningDraft();
  const form = useForm<ProvisionInput>({
    resolver: zodResolver(schema),
    defaultValues: stored ?? emptyDraft,
  });
  const [pending, setPending] = useState(false);
  const [created, setCreated] = useState<TenantRecord | null>(null);

  async function persist(values: ProvisionInput, launch: boolean) {
    setPending(true);
    const draft: ProvisionDraft = values;
    try {
      if (!launch) {
        await saveProvisioningDraft(draft);
        toast.success("Provisioning draft saved");
        return;
      }
      const record = await provisionTenant(draft, actor);
      setCreated(record);
      form.reset(emptyDraft);
      toast.success("Tenant provisioning started", { description: record.externalId });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Provisioning failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <PlatformGate>
      <div className="mx-auto max-w-4xl">
        <PageHeader
          title="New Tenant Provisioning"
          description="Configure infrastructure resources, identity providers, and initial feature sets for a new enterprise customer."
        />

        {created ? (
          <div className="mb-8 rounded-2xl border border-border-slate bg-white p-6">
            <p className="text-sm font-bold text-navy">{created.name} is provisioning</p>
            <p className="mt-1 text-sm text-slate-500">
              {created.externalId} · {created.slug}.bicmas.com · {created.plan}
            </p>
          </div>
        ) : null}

        <form className="grid grid-cols-1 gap-8 md:grid-cols-2" onSubmit={form.handleSubmit((values) => persist(values, true))}>
          <section className="space-y-6 rounded-2xl border border-border-slate bg-white p-8 shadow-sm">
            <h2 className="text-sm font-bold tracking-wider text-navy uppercase">General Configuration</h2>
            <Field label="Legal Entity Name" htmlFor="legalName" error={form.formState.errors.legalName?.message}>
              <Input id="legalName" placeholder="e.g. Acme Corp" {...form.register("legalName")} />
            </Field>
            <Field label="Tenant URL Slug" htmlFor="slug" error={form.formState.errors.slug?.message} hint=".bicmas.com">
              <Input id="slug" placeholder="acme" {...form.register("slug")} />
            </Field>
            <Field label="Primary Region" htmlFor="region" error={form.formState.errors.region?.message}>
              <select id="region" className={selectClass} {...form.register("region")}>
                {tenantRegions.map((region) => (
                  <option key={region} value={region}>
                    {region}
                  </option>
                ))}
              </select>
            </Field>
          </section>

          <section className="space-y-6 rounded-2xl border border-border-slate bg-white p-8 shadow-sm">
            <h2 className="text-sm font-bold tracking-wider text-navy uppercase">Plan & Entitlements</h2>
            <Field label="Subscription Tier" htmlFor="plan">
              <select id="plan" className={selectClass} {...form.register("plan")}>
                {tenantPlans.map((plan) => (
                  <option key={plan} value={plan}>
                    {plan}
                  </option>
                ))}
              </select>
            </Field>
            <fieldset className="space-y-3">
              <legend className="text-field-label mb-3">Core Feature Flags</legend>
              <label className="flex items-center gap-3 text-xs font-medium text-navy">
                <input type="checkbox" className="size-4" {...form.register("aiCoaching")} />
                AI Coaching Workspace
              </label>
              <label className="flex items-center gap-3 text-xs font-medium text-navy">
                <input type="checkbox" className="size-4" {...form.register("multiBu")} />
                Multi-Business Unit Support
              </label>
              <label className="flex items-center gap-3 text-xs font-medium text-navy">
                <input type="checkbox" className="size-4" {...form.register("saml")} />
                Custom SAML Identity Provider
              </label>
            </fieldset>
          </section>

          <section className="space-y-6 rounded-2xl border border-border-slate bg-white p-8 shadow-sm md:col-span-2">
            <h2 className="text-sm font-bold tracking-wider text-navy uppercase">Initial Admin Account</h2>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <Field label="Admin Name" htmlFor="adminName" error={form.formState.errors.adminName?.message}>
                <Input id="adminName" placeholder="Full Name" {...form.register("adminName")} />
              </Field>
              <Field label="Admin Email" htmlFor="adminEmail" error={form.formState.errors.adminEmail?.message}>
                <Input id="adminEmail" type="email" placeholder="admin@customer.com" {...form.register("adminEmail")} />
              </Field>
            </div>
          </section>

          <div className="flex flex-col gap-4 rounded-3xl bg-[#0B1E3B] p-8 text-white md:col-span-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-bold">Ready to Launch?</h2>
              <p className="mt-1 text-xs text-white/60">Infrastructure setup takes approximately 90 seconds.</p>
            </div>
            <div className="flex gap-4">
              <Button
                type="button"
                variant="ghost"
                className="text-white hover:bg-white/10 hover:text-green-lime"
                disabled={pending}
                onClick={form.handleSubmit((values) => persist(values, false))}
              >
                Save Draft
              </Button>
              <Button type="submit" variant="accent" disabled={pending}>
                Provision Resources
              </Button>
            </div>
          </div>
        </form>
      </div>
    </PlatformGate>
  );
}
