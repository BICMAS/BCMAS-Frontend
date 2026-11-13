"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  Building2Icon,
  ExpandIcon,
  MinusIcon,
  PlusIcon,
} from "lucide-react";
import { toast } from "sonner";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import type { OrgChartNode } from "@/features/organisation/types";
import { cn } from "@/lib/utils";

type OrgChartViewProps = {
  root: OrgChartNode;
};

type Density = "standard" | "compact";

export function OrgChartView({ root }: OrgChartViewProps) {
  const router = useRouter();
  const [zoom, setZoom] = useState(1);
  const [density, setDensity] = useState<Density>("standard");
  const [selectedId, setSelectedId] = useState(root.id);

  const departments = root.children ?? [];

  const scaleStyle = useMemo(
    () => ({ transform: `scale(${zoom})`, transformOrigin: "top center" }),
    [zoom],
  );

  const cardWidth = density === "compact" ? "w-44" : "w-56";
  const unitWidth = density === "compact" ? "w-40" : "w-48";

  return (
    <div className="relative flex min-h-[calc(100vh-8rem)] flex-col">
      <div className="absolute top-0 right-0 z-10 flex flex-col gap-2">
        <Button
          type="button"
          variant="secondary"
          size="icon"
          aria-label="Zoom in"
          onClick={() => setZoom((z) => Math.min(1.4, Number((z + 0.1).toFixed(2))))}
        >
          <PlusIcon className="size-3" />
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="icon"
          aria-label="Zoom out"
          onClick={() => setZoom((z) => Math.max(0.7, Number((z - 0.1).toFixed(2))))}
        >
          <MinusIcon className="size-3" />
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="icon"
          aria-label="Reset zoom"
          onClick={() => setZoom(1)}
        >
          <ExpandIcon className="size-3" />
        </Button>
      </div>

      <div className="shrink-0 pb-6">
        <Breadcrumb>
          <BreadcrumbList className="mb-1 text-[10px] font-bold tracking-widest text-slate-400 uppercase">
            <BreadcrumbItem>
              <BreadcrumbLink href="/org">Organization</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage className="text-navy">Org Chart</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-3xl font-bold tracking-tight text-navy">
            Visual Org Chart
          </h1>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex rounded-lg border border-border-slate bg-white p-1">
              <button
                type="button"
                className={cn(
                  "rounded-md px-4 py-1.5 text-xs font-bold",
                  density === "standard"
                    ? "bg-slate-100 text-navy"
                    : "text-slate-400 hover:text-navy",
                )}
                onClick={() => setDensity("standard")}
              >
                Standard
              </button>
              <button
                type="button"
                className={cn(
                  "rounded-md px-4 py-1.5 text-xs font-bold",
                  density === "compact"
                    ? "bg-slate-100 text-navy"
                    : "text-slate-400 hover:text-navy",
                )}
                onClick={() => setDensity("compact")}
              >
                Compact
              </button>
            </div>
            <Button
              type="button"
              variant="accent"
              className="shadow-md"
              onClick={() =>
                toast.message("Add Level", {
                  description:
                    "Hierarchy editing will connect to the organisation API later.",
                })
              }
            >
              <PlusIcon className="size-4" aria-hidden />
              Add Level
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto pb-10">
        <div className="flex min-w-full justify-center py-10" style={scaleStyle}>
          <div className="relative w-max">
            <div className="flex flex-col items-center">
              <button
                type="button"
                onClick={() => {
                  setSelectedId(root.id);
                  toast.message(root.name, {
                    description: root.subtitle ?? "Organisation root",
                  });
                }}
                className={cn(
                  cardWidth,
                  "relative z-10 rounded-2xl border-2 border-white bg-navy p-6 text-center text-white shadow-xl",
                  selectedId === root.id && "ring-2 ring-green-lime ring-offset-2",
                )}
              >
                <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-lg bg-green-lime shadow-lg shadow-green-lime/20">
                  <Building2Icon className="size-4 text-navy" aria-hidden />
                </div>
                <h3 className="text-sm font-bold">{root.name}</h3>
                {root.subtitle ? (
                  <p className="mt-1 text-[10px] tracking-widest text-white/60 uppercase">
                    {root.subtitle}
                  </p>
                ) : null}
              </button>

              <div className="h-16 w-px bg-border-slate" />
              <div
                className="h-px bg-border-slate"
                style={{
                  width: Math.max(departments.length * 280 - 80, 200),
                }}
              />

              <div
                className={cn(
                  "mt-0 flex",
                  density === "compact" ? "gap-10" : "gap-16 sm:gap-20",
                )}
              >
                {departments.map((dept) => (
                  <div
                    key={dept.id}
                    className="relative flex flex-col items-center"
                  >
                    <div className="h-16 w-px bg-border-slate" />
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(dept.id);
                        toast.message(dept.name, {
                          description: `${dept.employeeCount ?? 0} employees · ${dept.roleCount ?? 0} roles`,
                          action: {
                            label: "Open",
                            onClick: () => router.push("/org/departments"),
                          },
                        });
                      }}
                      className={cn(
                        cardWidth,
                        "group relative z-10 rounded-xl border border-border-slate bg-white p-5 text-center shadow-md transition-all hover:border-green-lime",
                        selectedId === dept.id && "border-green-lime",
                      )}
                    >
                      <h4 className="font-bold text-navy group-hover:text-green-deep">
                        {dept.name}
                      </h4>
                      <p className="mt-1 text-[10px] tracking-widest text-slate-400 uppercase">
                        {dept.employeeCount ?? 0} Employees
                      </p>
                      <div className="mt-4 flex justify-center gap-4 border-t border-slate-50 pt-4">
                        <div className="text-center">
                          <p className="text-[8px] font-bold text-slate-400 uppercase">
                            Roles
                          </p>
                          <p className="text-xs font-bold">{dept.roleCount ?? 0}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-[8px] font-bold text-slate-400 uppercase">
                            Health
                          </p>
                          <p
                            className={cn(
                              "text-xs font-bold",
                              (dept.healthPercent ?? 0) >= 85 && "text-green-deep",
                            )}
                          >
                            {dept.healthPercent ?? 0}%
                          </p>
                        </div>
                      </div>
                    </button>

                    {(dept.children?.length ?? 0) > 0 ? (
                      <>
                        <div className="h-12 w-px bg-border-slate" />
                        <div className="mt-0 space-y-4">
                          {dept.children?.map((unit) => (
                            <div
                              key={unit.id}
                              className={cn(
                                unitWidth,
                                "rounded-lg border border-border-slate bg-slate-50/80 p-3 text-center text-xs font-semibold text-slate-600",
                              )}
                            >
                              {unit.name}
                            </div>
                          ))}
                        </div>
                      </>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <p className="text-center text-xs text-slate-400">
        Tip: open{" "}
        <Link href="/org/departments" className="font-semibold text-navy hover:underline">
          Departments
        </Link>{" "}
        to manage roles under a selected branch.
      </p>
    </div>
  );
}
