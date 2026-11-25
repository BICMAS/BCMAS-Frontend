"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Field } from "@/components/shared/field";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getMockUser } from "@/config/mock-users";
import { SetupDetails } from "@/features/accounts/components/setup-details";
import { SETUP_METHOD_HINT, SETUP_METHOD_LABEL, setupMethods, type Setup } from "@/features/accounts/services/accounts";
import { PlatformGate } from "@/features/platform/components/platform-gate";
import {
  ENTITLEMENT_DESCRIPTION,
  entitlementOptions,
  getProvisioningDraft,
  PLAN_ENTITLEMENTS,
  PROVISIONING_SECONDS,
  provisionTenant,
  saveProvisioningDraft,
  tenantById,
  tenantPlans,
  type ProvisionDraft,
  type TenantPlan,
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
  plan: z.enum(["Enterprise Plus", "Standard", "Pilot / Trial"]),
  entitlements: z.array(z.string()).min(1, "Choose at least one feature"),
  adminName: z.string().trim().min(2, "Enter the admin name"),
  adminEmail: z.string().trim().email("Enter a valid admin email"),
  setupMethod: z.enum(setupMethods),
});

type ProvisionInput = z.infer<typeof schema>;

const selectClass =
  "h-11 w-full rounded-lg border border-border-slate bg-slate-50 px-4 text-sm font-bold text-navy outline-none focus-visible:ring-2 focus-visible:ring-navy";

const emptyDraft: ProvisionInput = {
  legalName: "",
  slug: "",
  plan: "Enterprise Plus",
  entitlements: [...PLAN_ENTITLEMENTS["Enterprise Plus"]],
  adminName: "",
  adminEmail: "",
  setupMethod: "code",
};

export function ProvisionTenantView() {
  usePlatformRevision();
  const actor = useSessionStore((state) => state.user.name);
  const form = useForm<ProvisionInput>({
    resolver: zodResolver(schema),
    defaultValues: { ...emptyDraft, ...getProvisioningDraft() },
  });
  const [pending, setPending] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [setup, setSetup] = useState<Setup | null>(null);
  const created = createdId ? tenantById(createdId) : null;
  const admin = created?.adminUserId ? getMockUser(created.adminUserId) : null;

  const plan = useWatch({ control: form.control, name: "plan" });
  const setupMethod = useWatch({ control: form.control, name: "setupMethod" });
  const chosen = useWatch({ control: form.control, name: "entitlements" });
  const matchesPlan =
    chosen.length === PLAN_ENTITLEMENTS[plan].length && PLAN_ENTITLEMENTS[plan].every((e) => chosen.includes(e));

  async function saveDraft() {
    setPending(true);
    try {
      // A draft keeps whatever has been entered so far; nothing is required yet.
      const draft: ProvisionDraft = form.getValues();
      await saveProvisioningDraft(draft);
      toast.success("Provisioning draft saved");
    } finally {
      setPending(false);
    }
  }

  async function launch(values: ProvisionInput) {
    setPending(true);
    try {
      const record = await provisionTenant(values, actor);
      setCreatedId(record.id);
      setSetup(record.setup);
      form.reset(emptyDraft);
      toast.success("Tenant provisioning started", { description: record.externalId });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Provisioning failed");
    } finally {
      setPending(false);
    }
  }

  function toggleEntitlement(option: string, on: boolean) {
    const next = on ? [...chosen, option] : chosen.filter((item) => item !== option);
    form.setValue(
      "entitlements",
      entitlementOptions.filter((e) => next.includes(e)),
      { shouldDirty: true, shouldValidate: form.formState.isSubmitted },
    );
  }

  return (
    <PlatformGate>
      <div className="mx-auto max-w-4xl">
        <PageHeader
          title="New Tenant Provisioning"
          description="Set up a new enterprise customer: their workspace address, subscription and features, and the first HR Admin."
        />

        {created ? (
          <section
            aria-label="Provisioned tenant"
            className="mb-8 space-y-2 rounded-2xl border border-border-slate bg-white p-6"
          >
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm font-bold text-navy">{created.name}</p>
              <Badge variant={created.status === "Active" ? "success" : "info"}>{created.status}</Badge>
            </div>
            <p className="text-sm text-slate-500">
              {created.externalId} · {created.slug}.bicmas.com · {created.plan} · Renewal: {created.renewal}
            </p>
            {admin ? (
              <p className="text-sm text-slate-600">
                {created.status === "Active"
                  ? `${admin.name} (${admin.email}) can now sign in and choose ${created.name} on Select Workspace.`
                  : created.status === "Awaiting Admin"
                    ? `Waiting for ${admin.name} (${admin.email}) to activate their account.`
                    : `${admin.name} (${admin.email}) can sign in once provisioning finishes (about ${PROVISIONING_SECONDS} seconds) and their account is activated.`}
              </p>
            ) : null}
            {setup ? (
              <div className="space-y-2 border-t border-border-slate pt-4">
                <h2 className="text-sm font-bold text-navy">First admin account</h2>
                <SetupDetails setup={setup} />
                {setup.code ? (
                  <p className="text-xs text-slate-500">
                    Call a number from the contract, not one given in an email. If the code is lost, create a new one in the Tenant Directory.
                  </p>
                ) : null}
              </div>
            ) : null}
            <Link href="/platform/tenants" className="text-sm font-bold text-navy underline underline-offset-4">
              View in Tenant Directory
            </Link>
          </section>
        ) : null}

        <form className="grid grid-cols-1 gap-8 md:grid-cols-2" onSubmit={form.handleSubmit(launch)}>
          <section className="space-y-6 rounded-2xl border border-border-slate bg-white p-8 shadow-sm">
            <h2 className="text-sm font-bold tracking-wider text-navy uppercase">General Configuration</h2>
            <Field label="Legal Entity Name" htmlFor="legalName" error={form.formState.errors.legalName?.message}>
              <Input id="legalName" placeholder="e.g. Acme Corp" {...form.register("legalName")} />
            </Field>
            <Field label="Tenant URL Slug" htmlFor="slug" error={form.formState.errors.slug?.message} hint=".bicmas.com">
              <Input id="slug" placeholder="acme" {...form.register("slug")} />
            </Field>
            <Field label="Subscription Tier" htmlFor="plan">
              <select
                id="plan"
                className={selectClass}
                {...form.register("plan", {
                  onChange: (event: { target: { value: string } }) => {
                    form.setValue("entitlements", [...PLAN_ENTITLEMENTS[event.target.value as TenantPlan]], {
                      shouldDirty: true,
                    });
                  },
                })}
              >
                {tenantPlans.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </Field>
          </section>

          <section className="space-y-4 rounded-2xl border border-border-slate bg-white p-8 shadow-sm">
            <h2 className="text-sm font-bold tracking-wider text-navy uppercase">Features</h2>
            <p className="text-xs text-slate-500">
              {matchesPlan
                ? `${plan} defaults. Add or remove features for this customer.`
                : `Customised from the ${plan} defaults.`}
            </p>
            <fieldset className="space-y-3">
              <legend className="sr-only">Features</legend>
              {entitlementOptions.map((option) => (
                <label key={option} className="flex items-start gap-3 text-navy">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4"
                    checked={chosen.includes(option)}
                    onChange={(event) => toggleEntitlement(option, event.target.checked)}
                  />
                  <span>
                    <span className="block text-sm font-medium">{option}</span>
                    <span className="block text-xs text-slate-500">{ENTITLEMENT_DESCRIPTION[option]}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            {form.formState.errors.entitlements?.message ? (
              <p className="text-xs font-medium text-destructive" role="alert">
                {form.formState.errors.entitlements.message}
              </p>
            ) : null}
          </section>

          <section className="space-y-6 rounded-2xl border border-border-slate bg-white p-8 shadow-sm md:col-span-2">
            <div>
              <h2 className="text-sm font-bold tracking-wider text-navy uppercase">Initial Admin Account</h2>
              <p className="mt-1 text-xs text-slate-500">
                This person becomes the tenant&apos;s HR Admin and can invite everyone else. They choose their own password.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <Field label="Admin Name" htmlFor="adminName" error={form.formState.errors.adminName?.message}>
                <Input id="adminName" placeholder="Full Name" {...form.register("adminName")} />
              </Field>
              <Field label="Admin Email" htmlFor="adminEmail" error={form.formState.errors.adminEmail?.message}>
                <Input id="adminEmail" type="email" placeholder="admin@customer.com" {...form.register("adminEmail")} />
              </Field>
              <Field label="Account setup" htmlFor="setupMethod" hint={SETUP_METHOD_HINT[setupMethod]} className="md:col-span-2">
                <select id="setupMethod" className={selectClass} {...form.register("setupMethod")}>
                  {setupMethods.map((option) => (
                    <option key={option} value={option}>
                      {SETUP_METHOD_LABEL[option]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </section>

          <div className="flex flex-col gap-4 rounded-3xl bg-[#0B1E3B] p-8 text-white md:col-span-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-bold">Ready to Launch?</h2>
              <p className="mt-1 text-xs text-white/60">
                Provisioning takes about {PROVISIONING_SECONDS} seconds. The tenant is Active once its first admin has set up their account.
              </p>
            </div>
            <div className="flex gap-4">
              <Button
                type="button"
                variant="ghost"
                className="text-white hover:bg-white/10 hover:text-green-lime"
                disabled={pending}
                onClick={saveDraft}
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
