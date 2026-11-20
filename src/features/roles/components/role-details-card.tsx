import { roleDetails, skillCoverage } from "@/features/roles/data/role-insights";
import type { RoleRecord } from "@/features/roles/types";

/** Structural details of a role: reporting line, grade, location and ownership. */
export function RoleDetailsCard({ role }: { role: RoleRecord }) {
  const details = roleDetails[role.id];
  const coverage = skillCoverage[role.id];
  const rows: [string, string][] = details
    ? [
        ["Reports To", details.reportsTo],
        ["Direct Reports", details.directReports.length ? details.directReports.join(", ") : "None"],
        ["Department", role.departmentName],
        ["Grade / Level", details.grade],
        ["Location", details.location],
        ["Employment Type", details.employmentType],
        ["Role Owner", details.roleOwner],
        ["Employees in Role", String(role.employeeCount)],
        [
          "Skill Profile Coverage",
          coverage ? `${coverage.approved} of ${coverage.required} required skills approved` : "Not started",
        ],
      ]
    : [
        ["Department", role.departmentName],
        ["Employees in Role", String(role.employeeCount)],
      ];

  return (
    <section
      aria-labelledby="role-details-heading"
      className="rounded-xl border border-border-slate bg-white p-8 shadow-sm"
    >
      <h3 id="role-details-heading" className="mb-4 text-lg font-bold text-navy">
        Role Details
      </h3>
      <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">{label}</dt>
            <dd className="mt-1 text-sm font-medium text-navy">{value}</dd>
          </div>
        ))}
      </dl>
      {!details ? (
        <p className="mt-4 text-xs text-slate-500">
          Reporting line, grade and location have not been recorded for this role yet.
        </p>
      ) : null}
    </section>
  );
}
