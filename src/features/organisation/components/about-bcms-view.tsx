import Link from "next/link";
import {
  BrainCircuitIcon,
  IdCardIcon,
  LockIcon,
  NetworkIcon,
  ShieldCheckIcon,
  UploadIcon,
  UsersIcon,
} from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";

// Draft copy for the Organisation Admin "About BCMS" page; the product team can edit the wording.

const lifecycle = [
  {
    icon: UploadIcon,
    title: "1. Upload organisational information",
    text: "Upload your organisation's information on the Organisation Overview page.",
    href: "/org",
  },
  {
    icon: ShieldCheckIcon,
    title: "2. Validate and process",
    text: "BCMS validates and processes the uploaded data.",
    href: "/org/bulk-upload",
  },
  {
    icon: NetworkIcon,
    title: "3. Structure created automatically",
    text: "Departments, roles and employee mappings are created automatically.",
    href: "/org/departments",
  },
  {
    icon: IdCardIcon,
    title: "4. Roles Directory populated",
    text: "The Roles Directory is populated with all imported roles.",
    href: "/roles",
  },
  {
    icon: BrainCircuitIcon,
    title: "5. AI skills profiles",
    text: "AI begins generating role-specific skills and competency profiles, subject to review and approval.",
    href: "/skills",
  },
  {
    icon: UsersIcon,
    title: "6. Maintain roles and profiles",
    text: "Add new roles, edit existing roles or manage their skills profiles at any time.",
    href: "/roles",
  },
];

const principles = [
  {
    icon: BrainCircuitIcon,
    title: "AI that assists, people who decide",
    text: "AI agents draft skills profiles, explain gaps, recommend learning and support coaching. Every consequential recommendation is reviewed and approved by a qualified person before it becomes official.",
  },
  {
    icon: LockIcon,
    title: "Your organisation's data stays yours",
    text: "Each organisation's data is kept separate. Access follows each user's role, and personal information is protected throughout.",
  },
];

export function AboutBcmsView() {
  return (
    <div className="mx-auto max-w-5xl space-y-10">
      <PageHeader
        title="About BCMS"
        description="BCMS helps your organisation define the capabilities each role needs, understand where your workforce stands against them, and develop people to close the gaps."
      />

      <section aria-labelledby="lifecycle-heading">
        <h2 id="lifecycle-heading" className="mb-4 text-lg font-bold text-navy">
          The BCMS user journey
        </h2>
        <ol className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {lifecycle.map(({ icon: Icon, title, text, href }) => (
            <li key={title}>
              <Link
                href={href}
                className="block h-full rounded-xl border border-border-slate bg-white p-6 shadow-sm transition hover:border-navy/30 hover:shadow-md"
              >
                <Icon className="mb-3 size-5 text-green-deep" aria-hidden />
                <h3 className="font-bold text-navy">{title}</h3>
                <p className="mt-1 text-sm text-slate-500">{text}</p>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="principles-heading" className="grid gap-4 md:grid-cols-2">
        <h2 id="principles-heading" className="sr-only">
          How BCMS works
        </h2>
        {principles.map(({ icon: Icon, title, text }) => (
          <div key={title} className="rounded-xl border border-border-slate bg-white p-6 shadow-sm">
            <Icon className="mb-3 size-5 text-navy" aria-hidden />
            <h3 className="font-bold text-navy">{title}</h3>
            <p className="mt-1 text-sm text-slate-500">{text}</p>
          </div>
        ))}
      </section>

      <section className="rounded-xl border border-border-slate bg-white p-6 shadow-sm">
        <h2 className="font-bold text-navy">Help & support</h2>
        <p className="mt-1 text-sm text-slate-500">
          For questions about your organisation&apos;s setup, contact your BCMS account administrator. Platform
          version and release notes are shown here once published.
        </p>
      </section>
    </div>
  );
}
