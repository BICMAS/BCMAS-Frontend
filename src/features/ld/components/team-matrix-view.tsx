"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { avatar } from "@/features/workforce/mock-workforce";
import { cn } from "@/lib/utils";

const skills = ["Cloud Arch", "API Gov", "Cyber Sec", "Microservices", "Infrastructure", "Observability"];

const rows = [
  {
    id: "james",
    name: "James Miller",
    avatarUrl: avatar(2),
    levels: ["L4", "L2", "L3", "L4", "L4", "L3"],
    readiness: "92%",
    plan: "/growth/plan-james-ai",
  },
  {
    id: "robert",
    name: "Robert Chen",
    avatarUrl: avatar(3),
    levels: ["L3", "L1", "L3", "L4", "L2", "L3"],
    readiness: "68%",
    plan: "/growth/plan-robert-infra",
  },
];

function levelClass(level: string) {
  if (level === "L4") return "bg-green-100 text-green-700";
  if (level === "L3") return "bg-blue-100 text-blue-700";
  if (level === "L2") return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-700";
}

export function TeamMatrixView() {
  const [department, setDepartment] = useState("IT Infrastructure");
  const [role, setRole] = useState("All Architects");
  const visible = department === "IT Infrastructure" ? rows : [];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        breadcrumbs={
          <p className="text-[11px] font-bold tracking-[0.1em] text-slate-400 uppercase">
            Growth Hub / Team Matrix
          </p>
        }
        title="Team Development Matrix"
        description="Map skill gaps across your entire department and assign learning pathways in bulk to accelerate capability growth."
        actions={
          <Button
            type="button"
            onClick={() =>
              toast.success("Learning queued", {
                description: `${visible.length} ${role} in ${department} can receive the AI Governance pathway.`,
              })
            }
          >
            Bulk Assign Learning
          </Button>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <select
            className="rounded-lg border border-border-slate bg-white px-3 py-2 text-xs font-bold text-navy"
            value={department}
            onChange={(event) => setDepartment(event.target.value)}
            aria-label="Department"
          >
            {["IT Infrastructure", "Finance", "Operations"].map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
          <select
            className="rounded-lg border border-border-slate bg-white px-3 py-2 text-xs font-bold text-navy"
            value={role}
            onChange={(event) => setRole(event.target.value)}
            aria-label="Role"
          >
            {["All Architects", "All roles"].map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-4 text-[10px] font-bold tracking-widest text-slate-400 uppercase">
          <span className="text-red-600">Critical Gap</span>
          <span className="text-green-deep">Target Met</span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border-slate bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-[10px] font-bold tracking-widest text-navy uppercase">
              <th className="px-4 py-4">Employees</th>
              {skills.map((skill) => (
                <th key={skill} className="px-4 py-4">
                  {skill}
                </th>
              ))}
              <th className="px-4 py-4">Readiness</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.id} className="border-t border-border-slate">
                <td className="px-4 py-4">
                  <Link href={row.plan} className="flex items-center gap-3 font-bold text-navy">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={row.avatarUrl} alt="" className="size-8 rounded-full object-cover" />
                    {row.name}
                  </Link>
                </td>
                {row.levels.map((level, index) => (
                  <td key={skills[index]} className="px-4 py-4">
                    <span className={cn("rounded px-2 py-0.5 text-[10px] font-bold", levelClass(level))}>
                      {level}
                    </span>
                  </td>
                ))}
                <td className="px-4 py-4 font-bold text-navy">{row.readiness}</td>
              </tr>
            ))}
            {visible.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">
                  No architects in {department} for this matrix.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
