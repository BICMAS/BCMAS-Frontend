"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { SearchField } from "@/components/shared/search-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createCycle, listCycles } from "@/features/workforce/mock-workforce";

export function AssessmentCyclesView() {
  const [cycles, setCycles] = useState(() => listCycles());
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const visible = cycles.filter((cycle) => cycle.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        breadcrumbs={
          <p className="text-[11px] font-bold tracking-[0.1em] text-slate-400 uppercase">
            Assessment Hub / Assessment Cycles
          </p>
        }
        title="Capability Assessment Cycles"
        description="Manage and monitor organizational capability assessment periods and verification workflows."
        actions={
          <>
            <Link href="/insights/learning">
              <Button type="button" variant="secondary">
                Assessment Reporting
              </Button>
            </Link>
            <Button type="button" onClick={() => setCreating((value) => !value)}>
              Create New Cycle
            </Button>
          </>
        }
      />

      {creating ? (
        <form
          className="flex flex-col gap-3 rounded-2xl border border-border-slate bg-white p-4 sm:flex-row"
          onSubmit={async (event) => {
            event.preventDefault();
            if (name.trim().length < 3) {
              toast.error("Enter a cycle name of at least 3 characters.");
              return;
            }
            const cycle = await createCycle(name);
            setCycles(listCycles());
            setName("");
            setCreating(false);
            toast.success("Cycle created", { description: cycle.name });
          }}
        >
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Cycle name"
            aria-label="Cycle name"
          />
          <Button type="submit">Save cycle</Button>
        </form>
      ) : null}

      <section className="rounded-2xl border border-border-slate border-l-4 border-l-green-lime bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-navy">2024 Global Capability Review</h2>
              <Badge variant="success">Active Cycle</Badge>
            </div>
            <p className="mt-1 text-sm text-slate-500">Scheduled for all employees in Global Enterprise Corp.</p>
          </div>
          <div className="flex gap-8 text-center">
            <div>
              <p className="text-[9px] font-bold tracking-widest text-slate-400 uppercase">Cycle Ends In</p>
              <p className="text-lg font-bold text-navy">12 Days</p>
            </div>
            <div>
              <p className="text-[9px] font-bold tracking-widest text-slate-400 uppercase">Verification Deadline</p>
              <p className="text-lg font-bold text-navy">24 Nov 2024</p>
            </div>
          </div>
        </div>
        <div className="mt-8">
          <div className="mb-3 flex justify-between text-sm font-bold text-navy">
            <span>Total Completion Progress</span>
            <span className="text-green-deep">68% (1,666 / 2,450)</span>
          </div>
          <div className="flex h-4 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full w-[45%] bg-green-lime" />
            <div className="h-full w-[23%] bg-green-deep" />
          </div>
          <p className="mt-3 text-[10px] font-bold tracking-widest text-slate-400 uppercase">
            Self-Assessed 45% · Verified 23% · Remaining 32%
          </p>
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() => toast.success("Reminders queued for employees who have not finished self-assessment.")}
          >
            Send Reminders
          </Button>
          <Link href="/assessments/cycle-2024">
            <Button type="button">View Cycle Dashboard</Button>
          </Link>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-border-slate bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-border-slate px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-bold tracking-wider text-navy uppercase">Cycle History</h2>
          <SearchField
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search past cycles..."
            aria-label="Search past cycles"
            containerClassName="sm:max-w-xs"
          />
        </div>
        <table className="w-full text-left text-sm">
          <thead className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
            <tr>
              {["Assessment Cycle", "Scope", "Status", "Completion", "Completed Date", "Actions"].map((heading) => (
                <th key={heading} className="px-6 py-3">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((cycle) => (
              <tr key={cycle.id} className="border-t border-border-slate">
                <td className="px-6 py-4 font-bold text-navy">{cycle.name}</td>
                <td className="px-6 py-4 text-slate-500">{cycle.scope}</td>
                <td className="px-6 py-4">
                  <Badge variant="secondary">{cycle.status}</Badge>
                </td>
                <td className="px-6 py-4 font-bold">{cycle.completion}%</td>
                <td className="px-6 py-4 text-xs text-slate-400">{cycle.completedDate}</td>
                <td className="px-6 py-4">
                  <Link href="/insights/learning" className="text-xs font-bold tracking-widest text-navy uppercase">
                    Reports
                  </Link>
                </td>
              </tr>
            ))}
            {visible.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-sm text-slate-500">
                  No cycles match that search.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
